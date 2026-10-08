import type { IChatItem } from '../types/chat';

export function exportAsMarkdown(messages: IChatItem[], agentName?: string): string {
  const lines: string[] = [];
  lines.push(`# Conversation with ${agentName || 'AI Agent'}`);
  lines.push(`_Exported ${new Date().toLocaleString()}_\n`);

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push(`## You\n> ${msg.content.replace(/\n/g, '\n> ')}\n`);
    } else if (msg.role === 'assistant') {
      lines.push(`## ${agentName || 'Assistant'}\n${msg.content}\n`);
    } else if (msg.role === 'approval') {
      lines.push(`## Tool Approval\n_MCP tool approval: ${msg.mcpApproval?.toolName || 'unknown'}_\n`);
    }
  }
  return lines.join('\n');
}

export function downloadMarkdown(content: string, filename?: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `conversation-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
