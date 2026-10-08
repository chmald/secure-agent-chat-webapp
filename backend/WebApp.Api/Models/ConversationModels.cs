namespace WebApp.Api.Models;

public record ConversationInfo(
    string Id,
    string Title,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt,
    IReadOnlyDictionary<string, string>? Metadata
);

public record ConversationListResponse(
    List<ConversationInfo> Conversations,
    int TotalCount
);

public record ConversationMessagesResponse(
    string ConversationId,
    List<MessageInfo> Messages
);

public record MessageInfo(
    string Id,
    string Role,
    string Content,
    DateTimeOffset Timestamp,
    List<FileAttachmentInfo>? Attachments
);

public record FileAttachmentInfo(
    string FileId,
    string FileName,
    long FileSizeBytes
);

public record ConversationSummary
{
    public required string Id { get; init; }
    public string? Title { get; init; }
    public long CreatedAt { get; init; }
}

public record ConversationMessageInfo
{
    public required string Role { get; init; }
    public required string Content { get; init; }
}
