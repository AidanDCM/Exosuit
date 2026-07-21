using System.Text.Json;

namespace Exosuit.Agent.Tests;

public sealed class FieldWireContractTests
{
    [Fact]
    public void Shared_field_contract_fixture_matches_windows_vocabulary()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "field-contract-v1.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        Assert.Equal(1, root.GetProperty("contractVersion").GetInt32());

        var identityJson = root.GetProperty("identity");
        Assert.Equal("field", identityJson.GetProperty("subsystem").GetString());
        var identity = new FieldIdentity(
            ExosuitSubsystem.Field,
            new FieldReference(identityJson.GetProperty("fieldId").GetGuid(), identityJson.GetProperty("fieldGeneration").GetInt32()),
            identityJson.GetProperty("agentId").GetString()!,
            identityJson.GetProperty("machineId").GetString()!,
            identityJson.GetProperty("windowsSessionId").GetString()!,
            identityJson.GetProperty("baseImageDigest").GetString()!,
            identityJson.GetProperty("personalStateDigest").GetString(),
            identityJson.GetProperty("taskDiskId").GetString()!,
            identityJson.GetProperty("createdAt").GetDateTimeOffset());
        identity.Validate();
        Assert.Equal(3, identity.Field.FieldGeneration);

        var displayJson = root.GetProperty("display");
        var display = new FieldDisplayContract(
            displayJson.GetProperty("monitorCount").GetInt32(),
            displayJson.GetProperty("width").GetInt32(),
            displayJson.GetProperty("height").GetInt32(),
            displayJson.GetProperty("scalePercent").GetInt32(),
            displayJson.GetProperty("browserZoomPercent").GetInt32(),
            displayJson.GetProperty("keyboardLayout").GetString()!,
            displayJson.GetProperty("dynamicResolutionAllowed").GetBoolean());
        display.Validate();

        var runtime = root.GetProperty("runtime");
        Assert.Equal("field", runtime.GetProperty("subsystem").GetString());
        Assert.Equal("teaching", runtime.GetProperty("lifecycle").GetString());
        Assert.Equal("glove-agent-fixture", runtime.GetProperty("gloveAgentId").GetString());

        var demonstration = root.GetProperty("demonstrationEvent");
        Assert.Equal("input", demonstration.GetProperty("source").GetString());
        Assert.Equal("mouse_click", demonstration.GetProperty("kind").GetString());
        Assert.Equal(4, demonstration.GetProperty("sequence").GetInt32());
    }
}
