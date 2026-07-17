using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

public static class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var port = ReadPort(Environment.GetEnvironmentVariable("EXOSUIT_AGENT_PORT"));
        builder.WebHost.UseUrls($"http://127.0.0.1:{port}");

        builder.Services.ConfigureHttpJsonOptions(options => ConfigureJson(options.SerializerOptions));
        var jsonOptions = new JsonSerializerOptions();
        ConfigureJson(jsonOptions);

        var agentToken = Environment.GetEnvironmentVariable("EXOSUIT_AGENT_TOKEN") ?? string.Empty;
        if (agentToken.Length < 32)
            throw new InvalidOperationException("EXOSUIT_AGENT_TOKEN must be at least 32 characters.");

        var providerName = (Environment.GetEnvironmentVariable("EXOSUIT_PROVIDER") ?? "fake").Trim().ToLowerInvariant();
        IDesktopProvider provider = providerName switch
        {
            "fake" => new FakeDesktopProvider(),
            "windows" when Environment.GetEnvironmentVariable("EXOSUIT_ENABLE_WINDOWS_PROVIDER") == "I_UNDERSTAND_WINDOWS_UI_AUTOMATION_RISK" =>
                new WindowsUiAutomationProvider(),
            "windows" => throw new InvalidOperationException(
                "The Windows provider requires EXOSUIT_ENABLE_WINDOWS_PROVIDER=I_UNDERSTAND_WINDOWS_UI_AUTOMATION_RISK."),
            _ => throw new InvalidOperationException("EXOSUIT_PROVIDER must be fake or windows.")
        };

        var initialMode = provider is FakeDesktopProvider ? ControlMode.Sandbox : ControlMode.Observe;
        var allowedProcesses = ParseAllowedProcesses(Environment.GetEnvironmentVariable("EXOSUIT_ALLOWED_PROCESSES"));
        var state = new AgentRuntimeState(
            initialMode,
            physicalInputEnabled: Environment.GetEnvironmentVariable("EXOSUIT_ENABLE_PHYSICAL_INPUT") == "true",
            screenshotCaptureEnabled: Environment.GetEnvironmentVariable("EXOSUIT_ENABLE_SCREENSHOTS") == "true",
            localFullControlEnabled: false,
            allowedProcesses);
        var policy = new SafetyPolicy();
        var approvals = new ProposalApprovalRegistry();
        var providerTimeout = ProviderDeadline.ReadMilliseconds(
            Environment.GetEnvironmentVariable("EXOSUIT_PROVIDER_TIMEOUT_MS"), 15_000, 1_000, 120_000);
        var emergencyStopTimeout = ProviderDeadline.ReadMilliseconds(
            Environment.GetEnvironmentVariable("EXOSUIT_EMERGENCY_STOP_TIMEOUT_MS"), 3_000, 250, 10_000);
        var dataDirectory = Environment.GetEnvironmentVariable("EXOSUIT_DATA_DIR") ??
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Exosuit");
        Directory.CreateDirectory(dataDirectory);
        var ledger = new HashChainAuditLedger(Path.Combine(dataDirectory, "audit.jsonl"), jsonOptions);
        await ledger.HydrateAsync();
        var localCsrfToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["X-Frame-Options"] = "DENY";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers["Content-Security-Policy"] =
                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
            await next();
        });

        app.Use(async (context, next) =>
        {
            try
            {
                await next();
            }
            catch (ProviderDeadlineExceededException exception)
            {
                await ledger.AppendAsync("provider_deadline_exceeded", "local-agent", Payload(
                    ("path", context.Request.Path.Value),
                    ("timeoutMilliseconds", exception.Timeout.TotalMilliseconds)), CancellationToken.None);
                if (!context.Response.HasStarted)
                {
                    context.Response.StatusCode = StatusCodes.Status504GatewayTimeout;
                    await context.Response.WriteAsJsonAsync(new
                    {
                        error = "The local desktop provider exceeded its configured deadline.",
                        code = "provider_deadline_exceeded"
                    }, CancellationToken.None);
                }
            }
        });

        app.Use(async (context, next) =>
        {
            if (!context.Request.Path.StartsWithSegments("/v1"))
            {
                await next();
                return;
            }

            if (!context.Request.Headers.TryGetValue("x-exosuit-token", out var supplied) ||
                !FixedTimeEquals(agentToken, supplied.ToString()))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new { error = "Unauthorized", code = "invalid_agent_token" });
                return;
            }
            await next();
        });

        app.MapGet("/", () => Results.Redirect("/ui"));
        app.MapGet("/ui", () => Results.Content(RenderControlPanel(state, provider, localCsrfToken), "text/html; charset=utf-8"));

        app.MapPost("/local/emergency-stop", async (HttpRequest request, CancellationToken cancellationToken) =>
        {
            if (!IsLoopback(request.HttpContext.Connection.RemoteIpAddress)) return Results.Unauthorized();
            var form = await request.ReadFormAsync(cancellationToken);
            if (!FixedTimeEquals(localCsrfToken, form["csrf"].ToString())) return Results.Unauthorized();
            await ActivateEmergencyStopAsync(
                state, approvals, provider, ledger, emergencyStopTimeout,
                form["reason"].ToString(), "local-control-panel", cancellationToken);
            return Results.Redirect("/ui");
        });

        app.MapPost("/local/proposals/{proposalId}/approve", async (
            string proposalId,
            HttpRequest request,
            CancellationToken cancellationToken) =>
        {
            if (!IsLoopback(request.HttpContext.Connection.RemoteIpAddress)) return Results.Unauthorized();
            var form = await request.ReadFormAsync(cancellationToken);
            if (!FixedTimeEquals(localCsrfToken, form["csrf"].ToString())) return Results.Unauthorized();
            if (!state.Proposals.TryGetValue(proposalId, out var proposal)) return Results.NotFound();
            if (proposal.Status != ProposalStatus.PendingReview) return Results.BadRequest(new { error = "Proposal is not pending review." });
            if (proposal.ExpiresAt <= DateTimeOffset.UtcNow) return Results.BadRequest(new { error = "Proposal expired." });
            if (proposal.Decision.ApprovalType == ApprovalType.TypedConfirmation &&
                !FixedTimeEquals($"APPROVE {proposalId}", form["confirmation"].ToString()))
                return Results.BadRequest(new { error = $"Type APPROVE {proposalId} exactly." });

            var approved = proposal with { Status = ProposalStatus.Approved };
            state.Proposals[proposalId] = approved;
            var fingerprint = approvals.Approve(approved);
            await ledger.AppendAsync("proposal_approved", "local-user", Payload(
                ("proposalId", proposalId), ("fingerprint", fingerprint)), cancellationToken);
            return Results.Redirect("/ui");
        });

        app.MapPost("/local/proposals/{proposalId}/deny", async (
            string proposalId,
            HttpRequest request,
            CancellationToken cancellationToken) =>
        {
            if (!IsLoopback(request.HttpContext.Connection.RemoteIpAddress)) return Results.Unauthorized();
            var form = await request.ReadFormAsync(cancellationToken);
            if (!FixedTimeEquals(localCsrfToken, form["csrf"].ToString())) return Results.Unauthorized();
            if (!state.Proposals.TryGetValue(proposalId, out var proposal)) return Results.NotFound();
            state.Proposals[proposalId] = proposal with { Status = ProposalStatus.Denied };
            approvals.Remove(proposalId);
            await ledger.AppendAsync("proposal_denied", "local-user", Payload(("proposalId", proposalId)), cancellationToken);
            return Results.Redirect("/ui");
        });

        app.MapPost("/local/mode", async (HttpRequest request, CancellationToken cancellationToken) =>
        {
            if (!IsLoopback(request.HttpContext.Connection.RemoteIpAddress)) return Results.Unauthorized();
            var form = await request.ReadFormAsync(cancellationToken);
            if (!FixedTimeEquals(localCsrfToken, form["csrf"].ToString())) return Results.Unauthorized();
            if (!Enum.TryParse<ControlMode>(form["mode"].ToString(), true, out var requested))
                return Results.BadRequest(new { error = "Invalid mode." });
            if (requested is ControlMode.FullControl or ControlMode.SkillAutopilot)
                return Results.BadRequest(new { error = "This panel cannot enable full_control or skill_autopilot." });
            if (requested == ControlMode.Sandbox && provider is not FakeDesktopProvider)
                return Results.BadRequest(new { error = "Sandbox mode requires the fake provider." });
            if (requested == ControlMode.Scoped && provider is FakeDesktopProvider)
                return Results.BadRequest(new { error = "Scoped mode is intended for the Windows provider." });
            state.SetMode(requested);
            await ledger.AppendAsync("control_mode_changed", "local-user", Payload(("mode", requested.ToString())), cancellationToken);
            return Results.Redirect("/ui");
        });

        app.MapGet("/v1/status", () => BuildStatus(state, provider));

        app.MapPost("/v1/observe", async (ObservationRequest request, CancellationToken cancellationToken) =>
        {
            var bounded = request with
            {
                IncludeScreenshot = request.IncludeScreenshot && state.ScreenshotCaptureEnabled,
                MaxElements = Math.Clamp(request.MaxElements, 1, 2_000)
            };
            var observation = await ProviderDeadline.RunAsync(
                token => provider.ObserveAsync(bounded, state, token), providerTimeout, cancellationToken);
            await ledger.AppendAsync("desktop_observed", "mcp", Payload(
                ("observationId", observation.ObservationId),
                ("windowCount", observation.Windows.Count),
                ("elementCount", observation.Elements.Count),
                ("screenshotRequested", request.IncludeScreenshot)), cancellationToken);
            return Results.Ok(observation);
        });

        app.MapPost("/v1/actions/propose", async (DesktopAction action, CancellationToken cancellationToken) =>
        {
            var validationError = ValidateAction(action);
            if (validationError is not null) return Results.BadRequest(new { error = validationError, code = "invalid_action" });

            var observation = await ProviderDeadline.RunAsync(
                token => provider.ObserveAsync(
                    new ObservationRequest(action.TargetWindowId, true, false, 2_000), state, token),
                providerTimeout,
                cancellationToken);
            var targetWindow = observation.Windows.FirstOrDefault(window => window.Id == action.TargetWindowId);
            var targetElement = observation.Elements.FirstOrDefault(element => element.Id == action.TargetElementId);
            var decision = policy.Evaluate(action, state, provider.Name, observation.ActiveWindow, targetWindow, targetElement);
            var now = DateTimeOffset.UtcNow;
            var proposal = new ActionProposal(
                $"proposal-{Guid.NewGuid():D}", now, now.AddMinutes(5), action, decision,
                observation.ActiveWindow?.Id,
                decision.Status switch
                {
                    PermissionStatus.Allow => ProposalStatus.Allowed,
                    PermissionStatus.ReviewRequired => ProposalStatus.PendingReview,
                    _ => ProposalStatus.Blocked
                });
            state.Proposals[proposal.ProposalId] = proposal;
            await ledger.AppendAsync("action_proposed", action.RequestedBy, Payload(
                ("proposalId", proposal.ProposalId),
                ("action", JsonSerializer.SerializeToElement(action, jsonOptions)),
                ("decision", JsonSerializer.SerializeToElement(decision, jsonOptions))), cancellationToken);
            return Results.Ok(proposal);
        });

        app.MapPost("/v1/actions/{proposalId}/execute", async (
            string proposalId,
            ExecuteProposalRequest request,
            CancellationToken cancellationToken) =>
        {
            if (!state.Proposals.TryGetValue(proposalId, out var proposal))
                return Results.NotFound(new { error = "Proposal not found.", code = "proposal_not_found" });
            if (proposal.ExpiresAt <= DateTimeOffset.UtcNow)
            {
                state.Proposals[proposalId] = proposal with { Status = ProposalStatus.Expired };
                approvals.Remove(proposalId);
                return Results.Ok(BlockedResult(proposal, "Proposal expired."));
            }
            if (state.EmergencyStopped || proposal.Status is ProposalStatus.Blocked or ProposalStatus.Denied or ProposalStatus.Expired)
                return Results.Ok(BlockedResult(proposal, "Local policy blocks this proposal."));
            if (proposal.Status == ProposalStatus.PendingReview)
                return Results.Ok(new ActionResult(proposalId, proposal.Action.Id, ResultStatus.PendingReview,
                    VerificationStatus.NotChecked, "Local approval is still required.",
                    new Dictionary<string, object?>(), Array.Empty<string>()));
            if (proposal.Status == ProposalStatus.Approved && !approvals.IsValid(proposal))
            {
                state.Proposals[proposalId] = proposal with { Status = ProposalStatus.Denied };
                approvals.Remove(proposalId);
                await ledger.AppendAsync("approval_fingerprint_mismatch", "local-agent", Payload(
                    ("proposalId", proposalId)), CancellationToken.None);
                return Results.Ok(BlockedResult(proposal, "The locally approved proposal no longer matches its immutable fingerprint."));
            }

            var fresh = await ProviderDeadline.RunAsync(
                token => provider.ObserveAsync(
                    new ObservationRequest(proposal.Action.TargetWindowId, true, false, 2_000), state, token),
                providerTimeout,
                cancellationToken);
            var freshTargetWindow = fresh.Windows.FirstOrDefault(window => window.Id == proposal.Action.TargetWindowId);
            var freshTargetElement = fresh.Elements.FirstOrDefault(element => element.Id == proposal.Action.TargetElementId);
            var freshDecision = policy.Evaluate(
                proposal.Action, state, provider.Name, fresh.ActiveWindow, freshTargetWindow, freshTargetElement);
            if (freshDecision.Status == PermissionStatus.Block)
            {
                approvals.Remove(proposalId);
                var blocked = BlockedResult(proposal, $"Action failed fresh policy evaluation: {freshDecision.Reason}");
                await ledger.AppendAsync("action_blocked_at_execution", "local-agent", Payload(
                    ("proposalId", proposalId), ("decision", JsonSerializer.SerializeToElement(freshDecision, jsonOptions))), cancellationToken);
                return Results.Ok(blocked);
            }
            if (freshDecision.Status == PermissionStatus.ReviewRequired &&
                (proposal.Status != ProposalStatus.Approved || freshDecision != proposal.Decision))
            {
                var pending = proposal with { Decision = freshDecision, Status = ProposalStatus.PendingReview };
                state.Proposals[proposalId] = pending;
                approvals.Remove(proposalId);
                await ledger.AppendAsync("fresh_review_required", "local-agent", Payload(
                    ("proposalId", proposalId),
                    ("decision", JsonSerializer.SerializeToElement(freshDecision, jsonOptions))), cancellationToken);
                return Results.Ok(new ActionResult(proposalId, proposal.Action.Id, ResultStatus.PendingReview,
                    VerificationStatus.NotChecked, "Fresh policy evaluation requires a new local approval.",
                    new Dictionary<string, object?>(), Array.Empty<string>()));
            }

            ProviderExecution execution;
            try
            {
                execution = await ProviderDeadline.RunAsync(
                    token => provider.ExecuteAsync(proposal.Action, token), providerTimeout, cancellationToken);
            }
            catch (ProviderDeadlineExceededException exception)
            {
                approvals.Remove(proposalId);
                state.Proposals[proposalId] = proposal with { Status = ProposalStatus.Denied };
                var timedOut = new ActionResult(proposalId, proposal.Action.Id, ResultStatus.Failed,
                    VerificationStatus.NotChecked, exception.Message,
                    new Dictionary<string, object?> { ["timeoutMilliseconds"] = exception.Timeout.TotalMilliseconds },
                    Array.Empty<string>());
                await ledger.AppendAsync("action_timed_out", "local-agent", Payload(
                    ("proposalId", proposalId),
                    ("timeoutMilliseconds", exception.Timeout.TotalMilliseconds)), CancellationToken.None);
                return Results.Ok(timedOut);
            }
            catch (OperationCanceledException)
            {
                approvals.Remove(proposalId);
                var cancelled = new ActionResult(proposalId, proposal.Action.Id, ResultStatus.Cancelled,
                    VerificationStatus.NotChecked, "The provider operation was cancelled.",
                    new Dictionary<string, object?>(), Array.Empty<string>());
                await ledger.AppendAsync("action_cancelled", "local-agent", Payload(("proposalId", proposalId)), CancellationToken.None);
                return Results.Ok(cancelled);
            }

            (bool Passed, string Summary, IReadOnlyDictionary<string, object?> Evidence) verification;
            try
            {
                verification = execution.Succeeded
                    ? await ProviderDeadline.RunAsync(
                        token => provider.VerifyAsync(proposal.Action.Expected, execution, token),
                        providerTimeout,
                        cancellationToken)
                    : (false, execution.Summary, execution.Evidence);
            }
            catch (ProviderDeadlineExceededException exception)
            {
                verification = (false, exception.Message,
                    new Dictionary<string, object?> { ["timeoutMilliseconds"] = exception.Timeout.TotalMilliseconds });
                await ledger.AppendAsync("verification_timed_out", "local-agent", Payload(
                    ("proposalId", proposalId),
                    ("timeoutMilliseconds", exception.Timeout.TotalMilliseconds)), CancellationToken.None);
            }

            var result = new ActionResult(
                proposalId,
                proposal.Action.Id,
                execution.Succeeded && verification.Passed ? ResultStatus.Succeeded : ResultStatus.Failed,
                verification.Passed ? VerificationStatus.Passed : VerificationStatus.Failed,
                verification.Summary,
                verification.Evidence,
                execution.Warnings);
            state.Proposals[proposalId] = proposal with { Status = ProposalStatus.Executed };
            approvals.Remove(proposalId);
            await ledger.AppendAsync(
                result.Status == ResultStatus.Succeeded ? "action_executed" : "action_failed",
                "local-agent",
                Payload(("proposalId", proposalId), ("result", JsonSerializer.SerializeToElement(result, jsonOptions))),
                cancellationToken);
            return Results.Ok(result);
        });

        app.MapPost("/v1/emergency-stop", async (EmergencyStopRequest request, CancellationToken cancellationToken) =>
        {
            var result = await ActivateEmergencyStopAsync(
                state, approvals, provider, ledger, emergencyStopTimeout,
                request.Reason, "mcp", cancellationToken);
            return Results.Ok(result);
        });

        app.MapGet("/v1/audit", (int? limit) => Results.Ok(ledger.Tail(Math.Clamp(limit ?? 100, 1, 1_000))));
        app.MapGet("/v1/audit/verify", () => Results.Ok(ledger.Verify()));

        await ledger.AppendAsync("agent_started", "local-agent", Payload(
            ("provider", provider.Name),
            ("mode", state.Mode.ToString()),
            ("port", port),
            ("physicalInputEnabled", state.PhysicalInputEnabled),
            ("screenshotCaptureEnabled", state.ScreenshotCaptureEnabled),
            ("providerTimeoutMilliseconds", providerTimeout.TotalMilliseconds),
            ("emergencyStopTimeoutMilliseconds", emergencyStopTimeout.TotalMilliseconds)));

        await app.RunAsync();
    }

    private static AgentStatus BuildStatus(AgentRuntimeState state, IDesktopProvider provider) => new(
        "0.1.0", provider.Name, state.Mode, state.EmergencyStopped,
        state.PhysicalInputEnabled, state.ScreenshotCaptureEnabled,
        state.PendingProposalCount, state.StartedAt);

    private static async Task<object> ActivateEmergencyStopAsync(
        AgentRuntimeState state,
        ProposalApprovalRegistry approvals,
        IDesktopProvider provider,
        HashChainAuditLedger ledger,
        TimeSpan emergencyStopTimeout,
        string? reason,
        string actor,
        CancellationToken cancellationToken)
    {
        state.ActivateEmergencyStop();
        approvals.Clear();
        foreach (var pair in state.Proposals.ToArray())
        {
            if (pair.Value.Status is not (ProposalStatus.Executed or ProposalStatus.Denied or ProposalStatus.Blocked or ProposalStatus.Expired))
                state.Proposals[pair.Key] = pair.Value with { Status = ProposalStatus.Denied };
        }

        var cancellationTimedOut = false;
        try
        {
            await ProviderDeadline.RunAsync(
                token => provider.CancelAsync(token), emergencyStopTimeout, cancellationToken);
        }
        catch (ProviderDeadlineExceededException exception)
        {
            cancellationTimedOut = true;
            await ledger.AppendAsync("emergency_stop_provider_timeout", actor, Payload(
                ("timeoutMilliseconds", exception.Timeout.TotalMilliseconds)), CancellationToken.None);
        }

        await ledger.AppendAsync("emergency_stop", actor, Payload(
            ("reason", reason ?? "No reason supplied."),
            ("providerCancellationTimedOut", cancellationTimedOut)), CancellationToken.None);
        return new
        {
            stopped = true,
            providerCancellationTimedOut = cancellationTimedOut,
            summary = cancellationTimedOut
                ? "Exosuit stopped locally and pending proposals were denied; provider cancellation exceeded its deadline."
                : "Exosuit stopped locally and pending proposals were denied."
        };
    }

    private static ActionResult BlockedResult(ActionProposal proposal, string summary) => new(
        proposal.ProposalId, proposal.Action.Id, ResultStatus.Blocked, VerificationStatus.NotChecked,
        summary, new Dictionary<string, object?> { ["policyRule"] = proposal.Decision.PolicyRule }, Array.Empty<string>());

    private static string? ValidateAction(DesktopAction action)
    {
        if (string.IsNullOrWhiteSpace(action.Id) || action.Id.Length > 200) return "Action ID must contain 1-200 characters.";
        if (string.IsNullOrWhiteSpace(action.Rationale) || action.Rationale.Length > 2_000) return "Rationale must contain 1-2000 characters.";
        if (action.Text?.Length > 20_000) return "Text exceeds the 20,000 character limit.";
        if (action.Keys is { Count: > 8 }) return "At most eight keys may be requested.";
        if (action.Delta is < -20 or > 20) return "Delta must be between -20 and 20.";
        if (string.IsNullOrWhiteSpace(action.Expected.Kind)) return "A verification expectation is required.";
        return null;
    }

    private static string RenderControlPanel(AgentRuntimeState state, IDesktopProvider provider, string csrf)
    {
        static string H(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);
        var proposals = state.Proposals.Values.OrderByDescending(static proposal => proposal.CreatedAt).Take(25).ToArray();
        var proposalRows = proposals.Length == 0
            ? "<p>No proposals yet.</p>"
            : string.Join("", proposals.Select(proposal =>
            {
                var approval = proposal.Status == ProposalStatus.PendingReview
                    ? $"<form method='post' action='/local/proposals/{H(proposal.ProposalId)}/approve'><input type='hidden' name='csrf' value='{H(csrf)}'><input name='confirmation' placeholder='{(proposal.Decision.ApprovalType == ApprovalType.TypedConfirmation ? H($"APPROVE {proposal.ProposalId}") : "optional note")}'><button>Approve locally</button></form>"
                    : string.Empty;
                var deny = proposal.Status is ProposalStatus.PendingReview or ProposalStatus.Allowed or ProposalStatus.Approved
                    ? $"<form method='post' action='/local/proposals/{H(proposal.ProposalId)}/deny'><input type='hidden' name='csrf' value='{H(csrf)}'><button>Deny</button></form>"
                    : string.Empty;
                return $"<article><strong>{H(proposal.Action.ActionType.ToString())}</strong> — {H(proposal.Status.ToString())}<br><code>{H(proposal.ProposalId)}</code><p>{H(proposal.Decision.Reason)}</p>{approval}{deny}</article>";
            }));

        return $$"""
<!doctype html><html><head><meta charset="utf-8"><title>Exosuit Local Control</title>
<style>body{font:16px system-ui;max-width:960px;margin:32px auto;padding:0 20px;background:#f5f5f5;color:#161616}header,section,article{background:white;border:1px solid #ddd;border-radius:12px;padding:18px;margin:14px 0}header{border-left:8px solid {{(state.EmergencyStopped ? "#b00020" : "#166534")}}}button{padding:9px 14px;margin:6px 6px 6px 0}input,select{padding:9px;min-width:280px}code{overflow-wrap:anywhere}.danger{background:#b00020;color:white;font-weight:700}</style></head><body>
<header><h1>Exosuit Local Control</h1><p><b>Provider:</b> {{H(provider.Name)}} &nbsp; <b>Mode:</b> {{H(state.Mode.ToString())}} &nbsp; <b>Emergency stop:</b> {{state.EmergencyStopped}}</p><p><b>Physical input:</b> {{state.PhysicalInputEnabled}} &nbsp; <b>Screenshots:</b> {{state.ScreenshotCaptureEnabled}} &nbsp; <b>Pending review:</b> {{state.PendingProposalCount}}</p></header>
<section><h2>Emergency stop</h2><form method="post" action="/local/emergency-stop"><input type="hidden" name="csrf" value="{{H(csrf)}}"><input name="reason" value="Stopped from local control panel"><button class="danger">STOP EXOSUIT</button></form></section>
<section><h2>Local control mode</h2><form method="post" action="/local/mode"><input type="hidden" name="csrf" value="{{H(csrf)}}"><select name="mode"><option>Observe</option><option>Guide</option><option>Sandbox</option><option>Scoped</option></select><button>Change mode</button></form><p>This panel cannot enable full control or skill autopilot.</p></section>
<section><h2>Recent proposals</h2>{{proposalRows}}</section>
</body></html>
""";
    }

    private static IReadOnlySet<string> ParseAllowedProcesses(string? raw) =>
        new HashSet<string>((raw ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            StringComparer.OrdinalIgnoreCase);

    private static int ReadPort(string? raw) => int.TryParse(raw, out var port) && port is >= 1024 and <= 65535 ? port : 43117;

    private static void ConfigureJson(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
        options.PropertyNameCaseInsensitive = true;
        options.Encoder = JavaScriptEncoder.Default;
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
    }

    private static bool FixedTimeEquals(string expected, string actual)
    {
        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var actualBytes = Encoding.UTF8.GetBytes(actual);
        return expectedBytes.Length == actualBytes.Length && CryptographicOperations.FixedTimeEquals(expectedBytes, actualBytes);
    }

    private static bool IsLoopback(IPAddress? address) => address is not null && IPAddress.IsLoopback(address);

    private static Dictionary<string, object?> Payload(params (string Key, object? Value)[] values) =>
        values.ToDictionary(static pair => pair.Key, static pair => pair.Value, StringComparer.Ordinal);
}
