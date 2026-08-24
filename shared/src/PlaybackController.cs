namespace Orbspeak.Shared;

/// <summary>
/// Single-session Read Aloud state machine. The engine keeps one active session
/// so Play/Pause/Resume/Stop cannot start competing document playback.
/// </summary>
public sealed class PlaybackController
{
    private readonly object _gate = new();
    private PlaybackSessionState _state = PlaybackSessionState.Idle;
    private string? _sessionId;
    private int? _activeIndex;
    private string? _error;

    public PlaybackSessionState State
    {
        get { lock (_gate) return _state; }
    }

    public string? SessionId
    {
        get { lock (_gate) return _sessionId; }
    }

    public int? ActiveIndex
    {
        get { lock (_gate) return _activeIndex; }
    }

    public string? Error
    {
        get { lock (_gate) return _error; }
    }

    public bool IsCurrent(string? sessionId)
    {
        lock (_gate)
        {
            return !string.IsNullOrWhiteSpace(sessionId) &&
                   string.Equals(_sessionId, sessionId, StringComparison.Ordinal);
        }
    }

    public string Begin()
    {
        lock (_gate)
        {
            _sessionId = Guid.NewGuid().ToString("n");
            _state = PlaybackSessionState.Loading;
            _activeIndex = null;
            _error = null;
            return _sessionId;
        }
    }

    public bool MarkPlaying(string sessionId, int index)
    {
        lock (_gate)
        {
            if (!Matches(sessionId) || _state is PlaybackSessionState.Stopped or PlaybackSessionState.Completed or PlaybackSessionState.Error)
            {
                return false;
            }

            _state = PlaybackSessionState.Playing;
            _activeIndex = index;
            return true;
        }
    }

    public bool TryPause()
    {
        lock (_gate)
        {
            if (_state is not (PlaybackSessionState.Loading or PlaybackSessionState.Playing))
            {
                return false;
            }

            _state = PlaybackSessionState.Paused;
            return true;
        }
    }

    public bool TryResume()
    {
        lock (_gate)
        {
            if (_state != PlaybackSessionState.Paused)
            {
                return false;
            }

            _state = _activeIndex is null ? PlaybackSessionState.Loading : PlaybackSessionState.Playing;
            return true;
        }
    }

    public bool Stop()
    {
        lock (_gate)
        {
            if (_state is PlaybackSessionState.Idle or PlaybackSessionState.Stopped)
            {
                _activeIndex = null;
                _state = PlaybackSessionState.Stopped;
                return _sessionId is not null;
            }

            _state = PlaybackSessionState.Stopped;
            _activeIndex = null;
            _error = null;
            return true;
        }
    }

    public bool Complete(string sessionId)
    {
        lock (_gate)
        {
            if (!Matches(sessionId))
            {
                return false;
            }

            _state = PlaybackSessionState.Completed;
            _activeIndex = null;
            return true;
        }
    }

    public bool Fail(string sessionId, string message)
    {
        lock (_gate)
        {
            if (!Matches(sessionId))
            {
                return false;
            }

            _state = PlaybackSessionState.Error;
            _activeIndex = null;
            _error = message;
            return true;
        }
    }

    public void Reset()
    {
        lock (_gate)
        {
            _state = PlaybackSessionState.Idle;
            _sessionId = null;
            _activeIndex = null;
            _error = null;
        }
    }

    private bool Matches(string sessionId) =>
        !string.IsNullOrWhiteSpace(_sessionId) &&
        string.Equals(_sessionId, sessionId, StringComparison.Ordinal);
}
