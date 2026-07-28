namespace Exosuit.AcceptanceFixture;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        using var form = new Form
        {
            Text = "Exosuit Disposable Acceptance Fixture",
            Width = 640,
            Height = 240,
            StartPosition = FormStartPosition.CenterScreen
        };

        var label = new Label
        {
            Text = "Disposable semantic-action field",
            AutoSize = true,
            Left = 24,
            Top = 24
        };
        var text = new TextBox
        {
            Name = "AcceptanceText",
            AccessibleName = "Exosuit acceptance text",
            Left = 24,
            Top = 56,
            Width = 560,
            TabIndex = 0
        };
        var status = new Label
        {
            Name = "AcceptanceStatus",
            AccessibleName = "Exosuit acceptance status",
            Text = "Ready",
            AutoSize = true,
            Left = 24,
            Top = 104
        };

        form.Controls.AddRange([label, text, status]);
        form.Shown += (_, _) => text.Focus();
        Application.Run(form);
    }
}
