// ============================================
// PERMISSION MANAGER
// Handles role-based permissions and access control
// ============================================

class PermissionManager {
    constructor() {
        this.permissions = this.definePermissions();
    }

    // ============================================
    // PERMISSION DEFINITIONS
    // ============================================
    definePermissions() {
        return {
            // Admin permissions
            admin: {
                modules: ['all'],
                actions: ['all']
            },

            // Teacher permissions
            teacher: {
                modules: [
                    'teacher-today',
                    'teacher-scores',
                    'my-classes',
                    'academics',
                    'calendar'
                ],
                actions: [
                    'view_students',
                    'view_own_classes',
                    'manage_grades',
                    'view_schedule',
                    'manage_assignments'
                ]
            },

            // Non-teaching staff permissions
            staff: {
                modules: [
                    'admin-dashboard',
                    'inventory',
                    'fees-payments',
                    // The bursar's queue; verify_fee_payment already admits staff.
                    'payment-checks',
                    // Staff share portal.html with admins; they still need their own
                    // profile and the shared calendar for the portal to be usable.
                    'admin-profile',
                    'calendar'
                ],
                actions: [
                    'view_inventory',
                    'request_items',
                    'view_fees',
                    'record_payments'
                ]
            },

            // Student permissions
            student: {
                modules: [
                    'family-home',
                    'family-fees',
                    'family-results',
                    'my-schedule',
                    'my-tasks'
                ],
                actions: [
                    'view_own_data',
                    'view_own_grades',
                    'view_own_fees',
                    'view_own_schedule',
                    'download_reports'
                ]
            },

            // Parents. The database decides which children they see
            // (students.guardian_auth_id, migration 0024); these are the pages.
            guardian: {
                modules: [
                    'family-home',
                    'family-fees',
                    'family-results'
                ],
                actions: [
                    'view_own_data',
                    'view_own_grades',
                    'view_own_fees'
                ]
            }
        };
    }

    // ============================================
    // PERMISSION CHECKS
    // ============================================
    canAccessModule(role, moduleName) {
        const rolePermissions = this.permissions[role];

        if (!rolePermissions) {
            return false;
        }

        // Admin has access to all modules
        if (rolePermissions.modules.includes('all')) {
            return true;
        }

        return rolePermissions.modules.includes(moduleName);
    }

    canPerformAction(role, actionName) {
        const rolePermissions = this.permissions[role];

        if (!rolePermissions) {
            return false;
        }

        // Admin can perform all actions
        if (rolePermissions.actions.includes('all')) {
            return true;
        }

        return rolePermissions.actions.includes(actionName);
    }

    getModulesForRole(role) {
        const rolePermissions = this.permissions[role];

        if (!rolePermissions) {
            return [];
        }

        if (rolePermissions.modules.includes('all')) {
            // Flatten all module lists, remove the sentinel 'all', deduplicate
            return [...new Set(
                Object.values(this.permissions)
                    .flatMap(r => r.modules)
                    .filter(m => m !== 'all')
            )];
        }

        return rolePermissions.modules;
    }

    getActionsForRole(role) {
        const rolePermissions = this.permissions[role];

        if (!rolePermissions) {
            return [];
        }

        if (rolePermissions.actions.includes('all')) {
            return ['all'];
        }

        return rolePermissions.actions;
    }

    // ============================================
    // UI HELPERS
    // ============================================
    shouldShowElement(role, requiredPermission) {
        return this.canPerformAction(role, requiredPermission);
    }

    disableIfNoPermission(role, requiredPermission) {
        return this.canPerformAction(role, requiredPermission) ? '' : 'disabled';
    }

    hideIfNoPermission(role, requiredPermission) {
        return this.canPerformAction(role, requiredPermission) ? '' : 'style="display: none;"';
    }
}

// Create global instance
const permissionManager = new PermissionManager();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.permissionManager = permissionManager;
}
