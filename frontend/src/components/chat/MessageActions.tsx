import { memo, useState, useCallback } from 'react';
import { Tooltip } from '@fluentui/react-components';
import {
  CopyRegular,
  ArrowClockwiseRegular,
  ThumbLikeRegular,
  ThumbDislikeRegular,
} from '@fluentui/react-icons';
import styles from './MessageActions.module.css';

interface MessageActionsProps {
  content: string;
  onRegenerate: () => void;
  onFeedback: (rating: 'positive' | 'negative') => void;
}

function MessageActionsComponent({ content, onRegenerate, onFeedback }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  }, [content]);

  const handleFeedback = useCallback((rating: 'positive' | 'negative') => {
    const newRating = feedback === rating ? null : rating;
    setFeedback(newRating);
    if (newRating) {
      onFeedback(newRating);
    }
  }, [feedback, onFeedback]);

  return (
    <div className={styles.actionsBar}>
      <Tooltip content={copied ? 'Copied!' : 'Copy'} relationship="label" withArrow>
        <button
          className={styles.actionButton}
          onClick={handleCopy}
          aria-label="Copy message"
        >
          {copied && <span className={styles.copiedTooltip} role="status" aria-live="polite">Copied!</span>}
          <CopyRegular fontSize={16} />
        </button>
      </Tooltip>

      <Tooltip content="Regenerate" relationship="label" withArrow>
        <button
          className={styles.actionButton}
          onClick={onRegenerate}
          aria-label="Regenerate response"
        >
          <ArrowClockwiseRegular fontSize={16} />
        </button>
      </Tooltip>

      <Tooltip content="Good response" relationship="label" withArrow>
        <button
          className={`${styles.actionButton} ${feedback === 'positive' ? styles.feedbackSelected : ''}`}
          onClick={() => handleFeedback('positive')}
          aria-label="Good response"
          aria-pressed={feedback === 'positive'}
        >
          <ThumbLikeRegular fontSize={16} />
        </button>
      </Tooltip>

      <Tooltip content="Bad response" relationship="label" withArrow>
        <button
          className={`${styles.actionButton} ${feedback === 'negative' ? styles.feedbackSelected : ''}`}
          onClick={() => handleFeedback('negative')}
          aria-label="Bad response"
          aria-pressed={feedback === 'negative'}
        >
          <ThumbDislikeRegular fontSize={16} />
        </button>
      </Tooltip>
    </div>
  );
}

export const MessageActions = memo(MessageActionsComponent);
