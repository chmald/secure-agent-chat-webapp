import { ApplicationInsights } from '@microsoft/applicationinsights-web';

const connectionString = import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING;

let appInsights: ApplicationInsights | null = null;

export function initTelemetry(): void {
  if (!connectionString) return;

  appInsights = new ApplicationInsights({
    config: {
      connectionString,
      enableAutoRouteTracking: false, // SPA with no router
      disableFetchTracking: false,
      enableCorsCorrelation: true,
      enableRequestHeaderTracking: false,
      enableResponseHeaderTracking: true,
      enableUnhandledPromiseRejectionTracking: true,
    },
  });

  appInsights.loadAppInsights();
}

export function trackException(error: Error, properties?: Record<string, string>): void {
  appInsights?.trackException({ exception: error }, properties);
}

export function trackEvent(name: string, properties?: Record<string, string>): void {
  appInsights?.trackEvent({ name }, properties);
}

export function trackFeedback(messageId: string, conversationId: string | null, rating: 'positive' | 'negative'): void {
  appInsights?.trackEvent({
    name: 'message_feedback',
    properties: {
      messageId,
      conversationId: conversationId ?? '',
      rating,
    },
  });
}
