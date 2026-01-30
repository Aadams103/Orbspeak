using System.IO;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

namespace Orbspeak.Ui;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}

internal sealed class MainForm : Form
{
    private readonly WebView2 _webView;
    private EngineSession? _session;

    public MainForm()
    {
        _webView = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(_webView);
        Text = "Orbspeak";
        Size = new System.Drawing.Size(1200, 800);
        StartPosition = FormStartPosition.CenterScreen;
        Load += MainForm_Load;
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        try
        {
            await _webView.EnsureCoreWebView2Async().ConfigureAwait(true);

            var initScript = @"
(function() {
  window.__engineIpc = {
    _cbs: { partial: [], final: [], state: [], error: [] },
    onPartial: function(f) { this._cbs.partial.push(f); },
    onFinal: function(f) { this._cbs.final.push(f); },
    onState: function(f) { this._cbs.state.push(f); },
    onError: function(f) { this._cbs.error.push(f); },
    start: function(opts) {
      var o = opts || {};
      if (window.chrome && window.chrome.webview)
        window.chrome.webview.postMessage(JSON.stringify({ type: 'dictation.start', profileId: o.profileId || 'default', mode: o.mode || 'default' }));
    },
    stop: function() {
      if (window.chrome && window.chrome.webview)
        window.chrome.webview.postMessage(JSON.stringify({ type: 'dictation.stop' }));
    }
  };
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', function(ev) {
      try {
        var d = ev.data;
        if (!d || !d.type) return;
        var p = d.payload != null ? JSON.parse(d.payload) : null;
        var cbs = window.__engineIpc._cbs;
        if (d.type === 'partial' && cbs.partial) cbs.partial.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'final' && cbs.final) cbs.final.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'state' && cbs.state) cbs.state.forEach(function(f) { try { f(p); } catch(e) {} });
        else if (d.type === 'error' && cbs.error) cbs.error.forEach(function(f) { try { f(p); } catch(e) {} });
      } catch(e) {}
    });
  }
})();
";
            await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(initScript).ConfigureAwait(true);

            _session = new EngineSession();
            _session.Partial += (p) => PostToWebView("partial", p);
            _session.Final += (p) => PostToWebView("final", p);
            _session.State += (p) => PostToWebView("state", p);
            _session.Error += (p) => PostToWebView("error", p);

            await _session.ConnectAsync().ConfigureAwait(true);

            _webView.WebMessageReceived += WebView_WebMessageReceived;

            var appPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "app"));
            if (Directory.Exists(appPath))
            {
                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.local",
                    appPath,
                    Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow);
                _webView.CoreWebView2.Navigate("https://app.local/index.html");
            }
            else
            {
                _webView.CoreWebView2.NavigateToString(
                    @"<html><body><p>Orbspeak app folder not found. Build the project to copy the React app to app\.</p></body></html>");
            }
        }
        catch (Exception ex)
        {
            _webView.CoreWebView2?.NavigateToString(
                $"<html><body><p>Failed to start: {ex.Message}</p></body></html>");
        }
    }

    private void PostToWebView(string type, JsonElement payload)
    {
        var json = JsonSerializer.Serialize(new { type, payload = payload.GetRawText() });
        void DoPost()
        {
            try { _webView.CoreWebView2?.PostWebMessageAsJson(json); } catch { }
        }
        if (InvokeRequired)
            BeginInvoke(DoPost);
        else
            DoPost();
    }

    private void WebView_WebMessageReceived(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (_session is null) return;
        try
        {
            if (!e.TryGetWebMessageAsString(out var raw) || string.IsNullOrEmpty(raw)) return;
            var d = JsonSerializer.Deserialize<JsonElement>(raw);
            var type = d.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type == "dictation.start")
            {
                var profileId = d.TryGetProperty("profileId", out var pid) ? pid.GetString() ?? "default" : "default";
                var mode = d.TryGetProperty("mode", out var m) ? m.GetString() ?? "default" : "default";
                _ = _session.StartDictationAsync(profileId, mode);
            }
            else if (type == "dictation.stop")
            {
                _ = _session.StopDictationAsync();
            }
        }
        catch { }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _session?.Disconnect();
        base.OnFormClosing(e);
    }
}
