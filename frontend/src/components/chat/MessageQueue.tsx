import { Button, Text } from '@fluentui/react-components';
import { DismissRegular, Attach24Regular } from '@fluentui/react-icons';
import styles from './MessageQueue.module.css';

interface QueuedMessage {
  text: string;
  files?: File[];
}

interface MessageQueueProps {
  messages: QueuedMessage[];
  onRemove: (index: number) => void;
}

export const MessageQueue: React.FC<MessageQueueProps> = ({ messages, onRemove }) => {
  if (messages.length === 0) return null;

  return (
    <div className={styles.queue} role="list" aria-label="Queued messages">
      <span className={styles.label}>Queued:</span>
      {messages.map((msg, i) => (
        <span key={i} role="listitem" className={styles.chip}>
          {msg.files && msg.files.length > 0 && <Attach24Regular style={{ fontSize: 12 }} />}
          <Text size={200}>{msg.text.length > 60 ? msg.text.slice(0, 60) + '…' : msg.text}</Text>
          <Button
            appearance="transparent"
            icon={<DismissRegular />}
            size="small"
            onClick={() => onRemove(i)}
            aria-label="Remove queued message"
            className={styles.dismissButton}
          />
        </span>
      ))}
    </div>
  );
};
