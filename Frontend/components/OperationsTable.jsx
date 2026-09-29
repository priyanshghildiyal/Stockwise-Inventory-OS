import { Form, InputGroup, Table } from 'react-bootstrap';
import StatusBadge from './StatusBadge.jsx';

const formatNumber = (value) => Number(value || 0).toLocaleString();

export default function OperationsTable({
  docs,
  warehouseList,
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  locationFilter,
  setLocationFilter,
  ledger = false,
}) {
  return (
    <div className="section-card">
      <div className="section-head section-head-wrap">
        <div>
          <h2 className="section-heading">
            {ledger ? 'Stock ledger' : 'Operational history'} <span className="soft-count">({docs.length})</span>
          </h2>
          <div className="section-sub">
            {ledger ? 'Every stock movement, count, and status update.' : 'Recent warehouse activity and record updates.'}
          </div>
        </div>
        <div className="toolbar toolbar-wrap">
          <InputGroup className="search-box">
            <InputGroup.Text className="input-glyph">⌕</InputGroup.Text>
            <Form.Control
              aria-label="Search operation records"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference or product"
            />
          </InputGroup>
          {ledger && (
            <Form.Select aria-label="Filter operations by type" className="filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="All">All types</option>
              <option value="Receipt">Receipt</option>
              <option value="Delivery">Delivery</option>
              <option value="Internal">Internal</option>
              <option value="Adjustment">Adjustment</option>
            </Form.Select>
          )}
          <Form.Select aria-label="Filter operations by status" className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="All">All statuses</option>
            <option value="Draft">Draft</option>
            <option value="Waiting">Waiting</option>
            <option value="Ready">Ready</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Done">Done</option>
            <option value="Canceled">Canceled</option>
          </Form.Select>
          <Form.Select aria-label="Filter operations by location" className="filter-select" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
            <option value="All">All locations</option>
            {warehouseList.map((location) => <option key={location} value={location}>{location}</option>)}
          </Form.Select>
        </div>
      </div>
      <div className="table-responsive">
        <Table hover>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>Product</th>
              <th>Qty</th>
              <th>{ledger ? 'Partner / movement' : 'Location'}</th>
              <th>Recorded by</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan="8"><div className="empty-state">No movement records match the current filters.</div></td>
              </tr>
            ) : docs.map((doc) => (
              <tr key={`${doc.id}-${doc.type}`}>
                <td><strong className="ref-code">{doc.id}</strong></td>
                <td>{doc.type}</td>
                <td><span className="product-name">{doc.product}</span></td>
                <td>{doc.type === 'Receipt' ? '+' : doc.type === 'Delivery' ? '−' : doc.type === 'Internal' ? '⇄' : '±'} {formatNumber(doc.qty)}</td>
                <td>{doc.partner || doc.location}</td>
                <td>{doc.actor || 'System'}</td>
                <td><StatusBadge status={doc.status} /></td>
                <td>{doc.date}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
