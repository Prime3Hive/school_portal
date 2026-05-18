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
                    'teacher-portal',
                    'teacher-dashboard',
                    'my-classes',
                    'assessments',
                    'class-schedule'
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
                    'fees-payments'
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
                    'student-dashboard',
                    'my-grades',
                    'my-fees',
                    'my-schedule'
                ],
                actions: [
                    'view_own_data',
                    'view_own_grades',
                    'view_own_fees',
                    'view_own_schedule',
                    'download_reports'
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
    // NAVIGATION FILTERING
    // ============================================
    filterNavigationByRole(role) {
        const allNavItems = {
            admin: [
                { icon: '📊', label: 'Dashboard', module: 'admin-dashboard' },
                { icon: '👥', label: 'Students', module: 'student-directory' },
                { icon: '👨‍🏫', label: 'Staff', module: 'staff-management' },
                { icon: '📅', label: 'Classes & Schedule', module: 'class-schedule' },
                { icon: '💰', label: 'Fees & Payments', module: 'fees-payments' },
                { icon: '📦', label: 'Inventory', module: 'inventory' },
                { icon: '�', label: 'Academics', module: 'academics' },
                { icon: '📋', label: 'Applications', module: 'applications' },
                { icon: '🔐', label: 'User Management', module: 'user-management' },
                { icon: '📆', label: 'Calendar', module: 'calendar' },
                { icon: '⚙️', label: 'Settings', module: 'settings' }
            ],
            teacher: [
                { icon: '📊', label: 'Teacher Portal', module: 'teacher-portal' },
                { icon: '👥', label: 'My Classes', module: 'my-classes' },
                { icon: '�', label: 'Academics', module: 'academics' },
                { icon: '📅', label: 'Schedule', module: 'class-schedule' },
            ],
            staff: [
                { icon: '📊', label: 'Dashboard', module: 'admin-dashboard' },
                { icon: '📦', label: 'Inventory', module: 'inventory' },
                { icon: '💰', label: 'Fees & Payments', module: 'fees-payments' }
            ],
            student: [
                { icon: '📊', label: 'Dashboard', module: 'student-dashboard' },
                { icon: '📝', label: 'My Grades', module: 'my-grades' },
                { icon: '💰', label: 'My Fees', module: 'my-fees' },
                { icon: '📅', label: 'My Schedule', module: 'my-schedule' },
            ]
        };

        return allNavItems[role] || [];
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
