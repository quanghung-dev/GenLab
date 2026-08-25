'use client';

import { useParams } from 'next/navigation';
import { WorkflowEditor } from '@/components/editor/workflow-editor';

export default function WorkflowEditorPage() {
  const params = useParams<{ projectId: string; workflowId: string }>();
  return <WorkflowEditor projectId={params.projectId} workflowId={params.workflowId} />;
}
