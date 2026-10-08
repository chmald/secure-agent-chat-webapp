using WebApp.Api.Models;

namespace WebApp.Api.Tests;

[TestClass]
public class ErrorResponseFactoryTests
{
    [TestMethod]
    [DataRow(400, "Invalid Request")]
    [DataRow(401, "Session Expired")]
    [DataRow(403, "Access Denied")]
    [DataRow(404, "Not Found")]
    [DataRow(429, "Too Many Requests")]
    [DataRow(500, "Service Temporarily Unavailable")]
    [DataRow(503, "Service Unavailable")]
    public void CreateFromException_MapsStatusCodeToTitle(int statusCode, string expectedTitle)
    {
        // Arrange
        var exception = new Exception("Test error");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, statusCode, isDevelopment: false);

        // Assert
        Assert.AreEqual(expectedTitle, response.Title);
        Assert.AreEqual(statusCode, response.Status);
    }

    [TestMethod]
    [DataRow(400, "The request contains invalid data. Please check your input and try again.")]
    [DataRow(401, "Your session has expired. Please sign in again to continue.")]
    [DataRow(403, "You don't have permission to perform this action.")]
    [DataRow(404, "The requested resource was not found.")]
    [DataRow(429, "You've made too many requests. Please wait a moment and try again.")]
    [DataRow(503, "The service is temporarily unavailable. Please try again in a few moments.")]
    public void CreateFromException_MapsStatusCodeToDetail(int statusCode, string expectedDetail)
    {
        // Arrange
        var exception = new Exception("Internal error message");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, statusCode, isDevelopment: false);

        // Assert
        Assert.AreEqual(expectedDetail, response.Detail);
    }

    [TestMethod]
    public void CreateFromException_InDevelopment_IncludesExceptionDetails()
    {
        // Arrange
        var exception = new InvalidOperationException("Detailed error message");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 500, isDevelopment: true);

        // Assert
        Assert.AreEqual("Detailed error message", response.Detail);
        Assert.IsNotNull(response.Extensions);
        Assert.AreEqual("InvalidOperationException", response.Extensions["exceptionType"]);
        Assert.IsTrue(response.Extensions.ContainsKey("stackTrace"));
    }

    [TestMethod]
    public void CreateFromException_InProduction_HidesExceptionDetails()
    {
        // Arrange
        var exception = new InvalidOperationException("Sensitive internal error");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 500, isDevelopment: false);

        // Assert
        Assert.IsFalse(response.Detail?.Contains("Sensitive") ?? false);
        Assert.IsNull(response.Extensions);
    }

    [TestMethod]
    public void CreateFromException_UnknownStatusCode_ReturnsGenericMessage()
    {
        // Arrange
        var exception = new Exception("Test error");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 418, isDevelopment: false);

        // Assert
        Assert.AreEqual("An Error Occurred", response.Title);
    }

    [TestMethod]
    public void CreateFromException_500InProduction_ReturnsGenericDetail()
    {
        // Arrange
        var exception = new Exception("Database connection failed");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 500, isDevelopment: false);

        // Assert
        Assert.AreEqual("An unexpected error occurred. Our team has been notified. Please try again later.", response.Detail);
    }

    [TestMethod]
    public void CreateFromException_UnknownStatusCode_ReturnsGenericDetail()
    {
        // Arrange
        var exception = new Exception("Weird error");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 418, isDevelopment: false);

        // Assert
        Assert.AreEqual("An unexpected error occurred. Please try again.", response.Detail);
    }

    [TestMethod]
    public void CreateFromException_UnknownStatusCodeInDevelopment_ShowsExceptionMessage()
    {
        // Arrange
        var exception = new Exception("Development debug message");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 418, isDevelopment: true);

        // Assert
        Assert.AreEqual("Development debug message", response.Detail);
        Assert.IsNotNull(response.Extensions);
    }

    [TestMethod]
    public void CreateFromException_NullStackTrace_ReturnsNA()
    {
        // Arrange - Exception without stack trace (not thrown)
        var exception = new Exception("Test");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 500, isDevelopment: true);

        // Assert
        Assert.IsNotNull(response.Extensions);
        Assert.AreEqual("N/A", response.Extensions["stackTrace"]);
    }

    [TestMethod]
    public void CreateFromException_SetsTypeToAboutBlank()
    {
        // Arrange
        var exception = new Exception("Test");

        // Act
        var response = ErrorResponseFactory.CreateFromException(exception, 400, isDevelopment: false);

        // Assert
        Assert.AreEqual("about:blank", response.Type);
    }
}
