import assert from 'node:assert/strict';
import test from 'node:test';
import { getRolePermissions, hasPermission, permissions } from './permissions.js';

test('centralized permissions enforce least privilege by role', () => {
  assert.equal(hasPermission('OWNER', permissions.organizationManage), true);
  assert.equal(hasPermission('VIEWER', permissions.organizationManage), false);
  assert.equal(hasPermission('WAREHOUSE_MANAGER', permissions.inventoryTransfer), true);
  assert.equal(hasPermission('FINANCE', permissions.inventoryTransfer), false);
  assert.equal(getRolePermissions('VIEWER').includes(permissions.productRead), true);
});
