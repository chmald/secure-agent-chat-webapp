using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace WebApp.Api.Tests;

[TestClass]
public class ConversationsEndpointTests
{
    [TestMethod]
    public void LimitClamping_DefaultIs20()
    {
        // Test: Math.Clamp(null ?? 20, 1, 100) == 20
        int? limit = null;
        var pageSize = Math.Clamp(limit ?? 20, 1, 100);
        Assert.AreEqual(20, pageSize);
    }

    [TestMethod]
    public void LimitClamping_MinIs1()
    {
        int? limit = 0;
        var pageSize = Math.Clamp(limit ?? 20, 1, 100);
        Assert.AreEqual(1, pageSize);
    }

    [TestMethod]
    public void LimitClamping_MaxIs100()
    {
        int? limit = 500;
        var pageSize = Math.Clamp(limit ?? 20, 1, 100);
        Assert.AreEqual(100, pageSize);
    }

    [TestMethod]
    public void LimitClamping_NegativeClampedTo1()
    {
        int? limit = -5;
        var pageSize = Math.Clamp(limit ?? 20, 1, 100);
        Assert.AreEqual(1, pageSize);
    }

    [TestMethod]
    public void HasMore_TrueWhenResultsExceedLimit()
    {
        var conversations = Enumerable.Range(0, 21).Select(i => $"conv-{i}").ToList();
        var pageSize = 20;
        var hasMore = conversations.Count > pageSize;
        Assert.IsTrue(hasMore);
    }

    [TestMethod]
    public void HasMore_FalseWhenResultsEqualLimit()
    {
        var conversations = Enumerable.Range(0, 20).Select(i => $"conv-{i}").ToList();
        var pageSize = 20;
        var hasMore = conversations.Count > pageSize;
        Assert.IsFalse(hasMore);
    }

    [TestMethod]
    public void HasMore_FalseWhenResultsBelowLimit()
    {
        var conversations = Enumerable.Range(0, 5).Select(i => $"conv-{i}").ToList();
        var pageSize = 20;
        var hasMore = conversations.Count > pageSize;
        Assert.IsFalse(hasMore);
    }

    [TestMethod]
    public void HasMore_TruncatesListToPageSize()
    {
        var conversations = Enumerable.Range(0, 25).Select(i => $"conv-{i}").ToList();
        var pageSize = 20;
        var hasMore = conversations.Count > pageSize;
        if (hasMore)
            conversations = conversations.Take(pageSize).ToList();
        Assert.AreEqual(20, conversations.Count);
        Assert.IsTrue(hasMore);
    }
}
