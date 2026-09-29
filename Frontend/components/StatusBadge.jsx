import React from 'react';
import { Badge } from 'react-bootstrap';

const statusClassMap = {
  Done: 'status-done',
  Ready: 'status-ready',
  Waiting: 'status-waiting',
  Scheduled: 'status-scheduled',
  Canceled: 'status-canceled',
  Draft: 'status-draft',
  'Out of stock': 'status-canceled',
  'Low stock': 'status-waiting',
  Healthy: 'status-done',
  Pending: 'status-waiting',
  Approved: 'status-ready',
  Returned: 'status-done',
  Processing: 'status-scheduled',
  Open: 'status-draft',
  Critical: 'status-canceled',
  Watch: 'status-waiting',
  Stable: 'status-done',
  Excess: 'status-scheduled',
};

export default function StatusBadge({ status }) {
  return <Badge className={`badge-soft ${statusClassMap[status] || 'status-draft'}`}>{status}</Badge>;
}
