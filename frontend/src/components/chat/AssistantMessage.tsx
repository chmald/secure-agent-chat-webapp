import { Suspense, memo, useMemo, useCallback } from 'react';
import { Spinner, Tooltip, Text } from '@fluentui/react-components';
import { CopilotMessage } from '@fluentui-copilot/react-copilot-chat';
import { DocumentRegular, GlobeRegular, FolderRegular, OpenRegular, ArrowSyncRegular } from '@fluentui/react-icons';
import { Markdown } from '../core/Markdown';
import { AgentIcon } from '../core/AgentIcon';
import { UsageInfo } from './UsageInfo';
import { MessageActions } from './MessageActions';
import { useFormatTimestamp } from '../../hooks/useFormatTimestamp';
import { parseContentWithCitations } from '../../utils/citationParser';
import type { IChatItem, IAnnotation } from '../../types/chat';
import styles from './AssistantMessage.module.css';

function getToolUseLabel(toolName: string): string {
  switch (toolName) {
    case 'file_search':
      return 'Searching files\u2026';
    case 'code_interpreter':
      return 'Running code\u2026';
    case 'function_call':
      return 'Calling tool\u2026';
    default:
      return 'Working\u2026';
  }
}

interface AssistantMessageProps {
  message: IChatItem;
  agentName?: string;
  agentLogo?: string;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onFeedback?: (messageId: string, rating: 'positive' | 'negative') => void;
  onDownloadFile?: (fileId: string, fileName: string, containerId?: string) => void;
}

function AssistantMessageComponent({ 
  message, 
  agentName = 'AI Assistant',
  agentLogo,
  isStreaming = false,
  onRegenerate,
  onFeedback,
  onDownloadFile,
}: AssistantMessageProps) {
  const formatTimestamp = useFormatTimestamp();
  const timestamp = message.more?.time ? formatTimestamp(new Date(message.more.time)) : '';
  
  // Show custom loading indicator when streaming with no content
  const showLoadingDots = isStreaming && !message.content && !message.retryAttempt;
  const isRetrying = isStreaming && !!message.retryAttempt;
  const hasAnnotations = message.annotations && message.annotations.length > 0;
  
  // Parse content with citations for consistent numbering between inline and footnotes
  const parsedContent = useMemo(() => {
    if (!hasAnnotations) return null;
    return parseContentWithCitations(message.content, message.annotations);
  }, [message.content, message.annotations, hasAnnotations]);

  // Get unique annotations with consistent indices
  // If the parser found citations (inline placeholders), use those
  // Otherwise, fall back to displaying all annotations as footnotes
  const indexedCitations = useMemo(() => {
    if (parsedContent?.citations && parsedContent.citations.length > 0) {
      return parsedContent.citations;
    }
    // No inline placeholders found - display all annotations as numbered footnotes
    // Deduplicate by label+type for fallback case
    if (message.annotations && message.annotations.length > 0) {
      const seen = new Map<string, { index: number; annotation: IAnnotation; count: number }>();
      message.annotations.forEach((annotation) => {
        const key = `${annotation.type}:${annotation.label}:${annotation.url || annotation.fileId || ''}`;
        if (seen.has(key)) {
          seen.get(key)!.count++;
        } else {
          seen.set(key, { index: seen.size + 1, annotation, count: 1 });
        }
      });
      return Array.from(seen.values());
    }
    return [];
  }, [parsedContent, message.annotations]);
  
  const handleFeedback = useCallback((rating: 'positive' | 'negative') => {
    onFeedback?.(message.id, rating);
  }, [message.id, onFeedback]);

  // Handle citation click - scroll to footnote or open URL
  const handleCitationClick = useCallback((index: number, annotation?: IAnnotation) => {
    if (annotation?.type === 'uri_citation' && annotation.url) {
      window.open(annotation.url, '_blank', 'noopener,noreferrer');
    } else {
      // Scroll to citation in footnotes
      const citationElement = document.getElementById(`citation-${message.id}-${index}`);
      if (citationElement) {
        citationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        citationElement.classList.add(styles.citationHighlight);
        setTimeout(() => {
          citationElement.classList.remove(styles.citationHighlight);
        }, 2000);
      }
    }
  }, [message.id]);
  
  // Build citation elements matching Foundry style
  const renderCitation = (annotation: IAnnotation, index: number, count: number = 1) => {
    const getIcon = () => {
      switch (annotation.type) {
        case 'uri_citation':
          return <GlobeRegular className={styles.citationIcon} />;
        case 'file_path':
          return <FolderRegular className={styles.citationIcon} />;
        default:
          return <DocumentRegular className={styles.citationIcon} />;
      }
    };

    const citationNumber = index;
    const tooltipContent = annotation.quote 
      ? `${annotation.label}${count > 1 ? ` (referenced ${count} times)` : ''}\n\n"${annotation.quote.slice(0, 200)}${annotation.quote.length > 200 ? '...' : ''}"`
      : `${annotation.label}${count > 1 ? ` (referenced ${count} times)` : ''}`;

    const hasFileDownload = (annotation.type === 'file_path' || annotation.type === 'container_file_citation') && annotation.fileId;
    const isClickable = (annotation.type === 'uri_citation' && annotation.url) || hasFileDownload;

    const handleClick = () => {
      if (annotation.type === 'uri_citation' && annotation.url) {
        window.open(annotation.url, '_blank', 'noopener,noreferrer');
      } else if (hasFileDownload && annotation.fileId) {
        onDownloadFile?.(annotation.fileId, annotation.label, annotation.containerId);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleClick();
      }
    };

    // Render citation button matching Foundry style
    return (
      <Tooltip
        key={`${annotation.label}-${index}`}
        content={tooltipContent}
        relationship="description"
        withArrow
      >
        <span 
          id={`citation-${message.id}-${citationNumber}`}
          className={`${styles.citation} ${isClickable ? styles.citationClickable : ''}`}
          onClick={isClickable ? handleClick : undefined}
          onKeyDown={isClickable ? handleKeyDown : undefined}
          role={isClickable ? 'button' : undefined}
          aria-label={isClickable ? (hasFileDownload ? `Download ${annotation.label}` : `Open ${annotation.label}`) : undefined}
          tabIndex={isClickable ? 0 : undefined}
        >
          <span className={styles.citationNumber}>{citationNumber}</span>
          <span className={styles.citationContent}>
            {getIcon()}
            <span className={styles.citationLabel}>{annotation.label}</span>
            {count > 1 && <span className={styles.citationCount}>×{count}</span>}
            {isClickable && <OpenRegular className={styles.citationExternalIcon} />}
          </span>
        </span>
      </Tooltip>
    );
  };

  const citations = indexedCitations.map(({ index, annotation, count }) => 
    renderCitation(annotation, index, count)
  );
  
  return (
    <CopilotMessage
      id={`msg-${message.id}`}
      avatar={<AgentIcon logoUrl={agentLogo} />}
      name={agentName}
      loadingState="none"
      className={styles.copilotMessage}
      disclaimer={<span>AI-generated content may be incorrect</span>}
      footnote={
        <div className={styles.footnoteContainer}>
          {hasAnnotations && !isStreaming && (
            <div className={styles.citationList}>
              {citations}
            </div>
          )}
          <div className={styles.metadataRow}>
            <div className={styles.metadataLeft}>
              {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
              {message.more?.usage && (
                <UsageInfo 
                  info={message.more.usage} 
                  duration={message.duration} 
                />
              )}
            </div>
            {!isStreaming && message.content && onRegenerate && (
              <MessageActions
                content={message.content}
                onRegenerate={onRegenerate}
                onFeedback={handleFeedback}
              />
            )}
          </div>
        </div>
      }
    >
      {showLoadingDots ? (
        isStreaming && message.activeToolUse ? (
          <div className={styles.toolUseIndicator}>
            <Spinner size="tiny" />
            <Text size={200}>{getToolUseLabel(message.activeToolUse)}</Text>
          </div>
        ) : (
          <div className={styles.loadingDots} role="status" aria-label="Assistant is thinking">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )
      ) : isRetrying ? (
        <div className={styles.retryingState}>
          <ArrowSyncRegular className={styles.retryingIcon} />
          <Text size={200}>
            Retrying ({message.retryAttempt}/{message.maxRetries})...
          </Text>
        </div>
      ) : (
        <>
          <Suspense fallback={<Spinner size="small" />}>
            <Markdown 
              content={message.content} 
              annotations={message.annotations}
              onCitationClick={handleCitationClick}
              onDownloadFile={onDownloadFile}
            />
          </Suspense>
          {isStreaming && message.activeToolUse && (
            <div className={styles.toolUseIndicator} role="status" aria-label={getToolUseLabel(message.activeToolUse)}>
              <Spinner size="tiny" />
              <Text size={200}>{getToolUseLabel(message.activeToolUse)}</Text>
            </div>
          )}
        </>
      )}
    </CopilotMessage>
  );
}

export const AssistantMessage = memo(AssistantMessageComponent, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.isStreaming === next.isStreaming &&
    prev.agentLogo === next.agentLogo &&
    prev.message.more?.usage === next.message.more?.usage &&
    prev.message.annotations?.length === next.message.annotations?.length &&
    prev.message.retryAttempt === next.message.retryAttempt &&
    prev.message.activeToolUse === next.message.activeToolUse
  );
});
