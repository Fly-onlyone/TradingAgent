using System.Net;
using System.Net.Mail;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;

namespace TradingAgent.Data.Notifications;

/// <summary>Sends a notification as an email.</summary>
public interface IEmailSender
{
    /// <summary>True when email is switched on and a server, a sender and a receiver are set.</summary>
    bool IsReady { get; }

    /// <exception cref="EmailException">The email could not be sent.</exception>
    Task SendAsync(string subject, string body, CancellationToken cancellationToken);
}

/// <summary>An email could not be sent. The message is fit to show.</summary>
public sealed class EmailException : Exception
{
    public EmailException()
    {
    }

    public EmailException(string message)
        : base(message)
    {
    }

    public EmailException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// Email through the SMTP server the user names in Settings. The connection is encrypted with
/// STARTTLS, which is what port 587 of the usual providers speaks; a server that only takes TLS from
/// the first byte (port 465) is not supported.
/// </summary>
public sealed class SmtpEmailSender(ISettingsStore settings, ISecretStore secrets) : IEmailSender
{
    private static readonly TimeSpan _timeout = TimeSpan.FromSeconds(20);

    public bool IsReady =>
        settings.GetValue(SettingKeys.EmailEnabled)
        && settings.GetValue(SettingKeys.EmailSmtpHost).Length > 0
        && IsAddress(settings.GetValue(SettingKeys.EmailFrom))
        && IsAddress(settings.GetValue(SettingKeys.EmailTo));

    public async Task SendAsync(string subject, string body, CancellationToken cancellationToken)
    {
        var host = settings.GetValue(SettingKeys.EmailSmtpHost).Trim();
        var from = settings.GetValue(SettingKeys.EmailFrom).Trim();
        var to = settings.GetValue(SettingKeys.EmailTo).Trim();
        if (host.Length == 0 || !IsAddress(from) || !IsAddress(to))
        {
            throw new EmailException("Email is not set up: give the server, the sender's address and the receiver's address.");
        }

        var user = settings.GetValue(SettingKeys.EmailUsername).Trim();
        try
        {
            using var client = new SmtpClient(host, settings.GetValue(SettingKeys.EmailSmtpPort))
            {
                EnableSsl = settings.GetValue(SettingKeys.EmailUseTls),
                Timeout = (int)_timeout.TotalMilliseconds,
                DeliveryMethod = SmtpDeliveryMethod.Network,
            };
            if (user.Length > 0)
            {
                client.Credentials = new NetworkCredential(user, secrets.Reveal(SecretNames.SmtpPassword) ?? string.Empty);
            }

            // No line break may come from a notification into a header.
            using var message = new MailMessage(from, to, subject.ReplaceLineEndings(" "), body);
            await client.SendMailAsync(message, cancellationToken).ConfigureAwait(false);
        }
        catch (SmtpException ex)
        {
            throw new EmailException($"The mail server refused: {ex.StatusCode}. Check the server, the port, the user name and the password.", ex);
        }
        catch (Exception ex) when (ex is IOException or FormatException or InvalidOperationException or System.Security.Authentication.AuthenticationException)
        {
            throw new EmailException("The mail server cannot be reached or does not speak STARTTLS on this port.", ex);
        }
    }

    private static bool IsAddress(string text) => MailAddress.TryCreate(text.Trim(), out _);
}
