"""Live events: the Redis-streams event bus behind the SSE routes (API.md §4).

Publishers (after their transaction commits):

    from kaptan.events.publish import publish
    await publish(request.app, "desk", "approval.decided", card)

Import from the module (the package does not re-export it, so `kaptan.events.publish` stays the
module). `bus` holds the Redis keys, the single-use SSE tickets and the stream reader that renders SSE frames.
"""
