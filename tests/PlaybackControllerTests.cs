using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class PlaybackControllerTests
{
    [Fact]
    public void PlayPauseResumeStop_FollowsSingleSession()
    {
        var playback = new PlaybackController();
        var session = playback.Begin();
        Assert.Equal(PlaybackSessionState.Loading, playback.State);
        Assert.Null(playback.ActiveIndex);

        Assert.True(playback.MarkPlaying(session, 0));
        Assert.Equal(0, playback.ActiveIndex);
        Assert.True(playback.TryPause());
        Assert.Equal(PlaybackSessionState.Paused, playback.State);
        Assert.Equal(0, playback.ActiveIndex);
        Assert.True(playback.TryResume());
        Assert.Equal(PlaybackSessionState.Playing, playback.State);
        Assert.Equal(0, playback.ActiveIndex);
        Assert.True(playback.Stop());
        Assert.Equal(PlaybackSessionState.Stopped, playback.State);
        Assert.Null(playback.ActiveIndex);
    }

    [Fact]
    public void Replay_ResetsHighlight()
    {
        var playback = new PlaybackController();
        var first = playback.Begin();
        playback.MarkPlaying(first, 2);
        var second = playback.Begin();
        Assert.NotEqual(first, second);
        Assert.Null(playback.ActiveIndex);
        Assert.Equal(PlaybackSessionState.Loading, playback.State);
        Assert.False(playback.MarkPlaying(first, 3));
        Assert.True(playback.MarkPlaying(second, 0));
        Assert.Equal(0, playback.ActiveIndex);
    }

    [Fact]
    public void Complete_ClearsActivePlayback()
    {
        var playback = new PlaybackController();
        var session = playback.Begin();
        playback.MarkPlaying(session, 1);
        Assert.True(playback.Complete(session));
        Assert.Equal(PlaybackSessionState.Completed, playback.State);
        Assert.Null(playback.ActiveIndex);
    }

    [Fact]
    public void Fail_RecoversToErrorWithoutActiveIndex()
    {
        var playback = new PlaybackController();
        var session = playback.Begin();
        playback.MarkPlaying(session, 0);
        Assert.True(playback.Fail(session, "sidecar down"));
        Assert.Equal(PlaybackSessionState.Error, playback.State);
        Assert.Equal("sidecar down", playback.Error);
        Assert.Null(playback.ActiveIndex);
        var next = playback.Begin();
        Assert.Equal(PlaybackSessionState.Loading, playback.State);
        Assert.Null(playback.Error);
        Assert.True(playback.IsCurrent(next));
    }

    [Fact]
    public void PauseAndResume_AreNoOpsOutsideActivePlayback()
    {
        var playback = new PlaybackController();
        Assert.False(playback.TryPause());
        Assert.False(playback.TryResume());
        playback.Begin();
        playback.Stop();
        Assert.False(playback.TryResume());
    }
}
