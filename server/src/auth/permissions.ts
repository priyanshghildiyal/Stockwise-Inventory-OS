export const permissions = {
  productRead: 'product.read',
  productCreate: 'product.create',
  productUpdate: 'product.update',
  productDelete: 'product.delete',
  inventoryRead: 'inventory.read',
  inventoryReceive: 'inventory.receive',
  inventoryIssue: 'inventory.issue',
  inventoryAdjust: 'inventory.adjust',
  inventoryTransfer: 'inventory.transfer',
  inventoryReserve: 'inventory.reserve',
  warehouseRead: 'warehouse.read',
  warehouseManage: 'warehouse.manage',
  warehouseCount: 'warehouse.count',
  purchaseApprove: 'purchase.approve',
  salesShip: 'sales.ship',
  invoicePayment: 'invoice.record_payment',
  reportView: 'report.view',
  auditView: 'audit.view',
  userManage: 'user.manage',
  organizationManage: 'organization.manage',
} as const;

export type Permission = typeof permissions[keyof typeof permissions];
export type Role = 'OWNER' | 'ADMIN' | 'INVENTORY_MANAGER' | 'WAREHOUSE_MANAGER' | 'PROCUREMENT' | 'FINANCE' | 'SALES' | 'EMPLOYEE' | 'AUDITOR' | 'VIEWER';

const allPermissions = Object.values(permissions) as Permission[];
const rolePermissions: Record<Role, readonly Permission[]> = {
  OWNER: allPermissions,
  ADMIN: allPermissions.filter((permission) => permission !== permissions.organizationManage),
  INVENTORY_MANAGER: [permissions.productRead, permissions.productCreate, permissions.productUpdate, permissions.inventoryRead, permissions.inventoryReceive, permissions.inventoryIssue, permissions.inventoryAdjust, permissions.inventoryTransfer, permissions.inventoryReserve, permissions.warehouseRead, permissions.warehouseCount, permissions.reportView],
  WAREHOUSE_MANAGER: [permissions.productRead, permissions.inventoryRead, permissions.inventoryReceive, permissions.inventoryIssue, permissions.inventoryAdjust, permissions.inventoryTransfer, permissions.inventoryReserve, permissions.warehouseRead, permissions.warehouseManage, permissions.warehouseCount, permissions.reportView],
  PROCUREMENT: [permissions.productRead, permissions.inventoryRead, permissions.warehouseRead, permissions.purchaseApprove, permissions.reportView],
  FINANCE: [permissions.invoicePayment, permissions.reportView, permissions.auditView],
  SALES: [permissions.productRead, permissions.inventoryRead, permissions.inventoryReserve, permissions.warehouseRead, permissions.salesShip, permissions.reportView],
  EMPLOYEE: [permissions.productRead, permissions.inventoryRead, permissions.warehouseRead],
  AUDITOR: [permissions.productRead, permissions.inventoryRead, permissions.warehouseRead, permissions.reportView, permissions.auditView],
  VIEWER: [permissions.productRead, permissions.inventoryRead, permissions.warehouseRead, permissions.reportView],
};

export const hasPermission = (role: Role, permission: Permission) => rolePermissions[role]?.includes(permission) ?? false;
export const getRolePermissions = (role: Role) => [...(rolePermissions[role] || [])];
