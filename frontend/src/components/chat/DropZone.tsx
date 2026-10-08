import { ArrowUploadRegular } from '@fluentui/react-icons';
import styles from './DropZone.module.css';

interface DropZoneProps {
  visible: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.dropArea}>
        <ArrowUploadRegular className={styles.icon} aria-hidden="true" />
        <span className={styles.label}>Drop files here</span>
        <span className={styles.hint}>Images, PDFs, and text files supported</span>
      </div>
    </div>
  );
};
