// ============================================
// VALIDATION MANAGER
// Centralized validation and uniqueness checking
// ============================================

const validationManager = {
    // Email validation regex
    emailRegex: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
    
    // Phone validation regex (supports various formats)
    phoneRegex: /^[0-9+\-\(\)\s]{10,20}$/,

    /**
     * Validate email format
     */
    isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        return this.emailRegex.test(email.trim());
    },

    /**
     * Validate phone number format
     */
    isValidPhone(phone) {
        if (!phone || typeof phone !== 'string') return false;
        return this.phoneRegex.test(phone.trim());
    },

    /**
     * Check if email is unique across all tables
     * @param {string} email - Email to check
     * @param {string} excludeId - Optional ID to exclude from check (for updates)
     * @param {string} excludeTable - Optional table name to exclude
     * @returns {Promise<{isUnique: boolean, existsIn: string|null}>}
     */
    async checkEmailUniqueness(email, excludeId = null, excludeTable = null) {
        if (!email) return { isUnique: true, existsIn: null };
        
        const normalizedEmail = email.toLowerCase().trim();
        
        try {
            // Check profiles table
            if (excludeTable !== 'profiles') {
                const { data: profileData } = await supabaseClient
                    .from('profiles')
                    .select('id, email')
                    .ilike('email', normalizedEmail)
                    .limit(1);
                
                if (profileData && profileData.length > 0) {
                    if (!excludeId || profileData[0].id !== excludeId) {
                        return { isUnique: false, existsIn: 'profiles (user account)' };
                    }
                }
            }

            // Check staff table
            if (excludeTable !== 'staff') {
                const { data: staffData } = await supabaseClient
                    .from('staff')
                    .select('id, email')
                    .ilike('email', normalizedEmail)
                    .limit(1);
                
                if (staffData && staffData.length > 0) {
                    if (!excludeId || staffData[0].id !== excludeId) {
                        return { isUnique: false, existsIn: 'staff records' };
                    }
                }
            }

            // Check students table
            if (excludeTable !== 'students') {
                const { data: studentData } = await supabaseClient
                    .from('students')
                    .select('id, email')
                    .ilike('email', normalizedEmail)
                    .limit(1);
                
                if (studentData && studentData.length > 0) {
                    if (!excludeId || studentData[0].id !== excludeId) {
                        return { isUnique: false, existsIn: 'student records' };
                    }
                }
            }

            // Check applications table (parent email)
            if (excludeTable !== 'applications') {
                const { data: appData } = await supabaseClient
                    .from('applications')
                    .select('id, parent_email')
                    .ilike('parent_email', normalizedEmail)
                    .limit(1);
                
                if (appData && appData.length > 0) {
                    if (!excludeId || appData[0].id !== excludeId) {
                        return { isUnique: false, existsIn: 'application records' };
                    }
                }
            }

            return { isUnique: true, existsIn: null };
        } catch (error) {
            console.error('[ValidationManager] Error checking email uniqueness:', error);
            throw new Error('Failed to verify email uniqueness');
        }
    },

    /**
     * Check if phone number is unique across relevant tables
     * @param {string} phone - Phone number to check
     * @param {string} excludeId - Optional ID to exclude from check
     * @param {string} excludeTable - Optional table name to exclude
     * @returns {Promise<{isUnique: boolean, existsIn: string|null}>}
     */
    async checkPhoneUniqueness(phone, excludeId = null, excludeTable = null) {
        if (!phone) return { isUnique: true, existsIn: null };

        // Normalize: digits only for comparison
        const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '').trim();
        // Use last 8 digits as a server-side filter — avoids fetching all records
        const last8 = normalizedPhone.slice(-8);

        if (last8.length < 6) return { isUnique: true, existsIn: null };

        try {
            // Check staff table — server-side filtered by last 8 digits
            if (excludeTable !== 'staff') {
                const { data: staffData } = await supabaseClient
                    .from('staff')
                    .select('id, phone')
                    .ilike('phone', `%${last8}%`)
                    .not('phone', 'is', null);

                if (staffData) {
                    const match = staffData.find(s => {
                        const staffPhone = (s.phone || '').replace(/[\s\-\(\)]/g, '');
                        return staffPhone === normalizedPhone && (!excludeId || s.id !== excludeId);
                    });
                    if (match) return { isUnique: false, existsIn: 'staff records' };
                }
            }

            // Check students table — server-side filtered
            if (excludeTable !== 'students') {
                const { data: studentData } = await supabaseClient
                    .from('students')
                    .select('id, phone')
                    .ilike('phone', `%${last8}%`)
                    .not('phone', 'is', null);

                if (studentData) {
                    const match = studentData.find(s => {
                        const studentPhone = (s.phone || '').replace(/[\s\-\(\)]/g, '');
                        return studentPhone === normalizedPhone && (!excludeId || s.id !== excludeId);
                    });
                    if (match) return { isUnique: false, existsIn: 'student records' };
                }
            }

            // Check applications table — server-side filtered
            if (excludeTable !== 'applications') {
                const { data: appData } = await supabaseClient
                    .from('applications')
                    .select('id, parent_phone')
                    .ilike('parent_phone', `%${last8}%`)
                    .not('parent_phone', 'is', null);

                if (appData) {
                    const match = appData.find(a => {
                        const appPhone = (a.parent_phone || '').replace(/[\s\-\(\)]/g, '');
                        return appPhone === normalizedPhone && (!excludeId || a.id !== excludeId);
                    });
                    if (match) return { isUnique: false, existsIn: 'application records' };
                }
            }

            return { isUnique: true, existsIn: null };
        } catch (error) {
            console.error('[ValidationManager] Error checking phone uniqueness:', error);
            throw new Error('Failed to verify phone number uniqueness');
        }
    },

    /**
     * Validate and check uniqueness for user input
     * @param {Object} data - Data to validate
     * @param {Object} options - Validation options
     * @returns {Promise<{isValid: boolean, errors: Array}>}
     */
    async validateUserInput(data, options = {}) {
        const errors = [];
        const { excludeId = null, excludeTable = null, checkUniqueness = true } = options;

        // Email validation
        if (data.email !== undefined && data.email !== null && data.email !== '') {
            if (!this.isValidEmail(data.email)) {
                errors.push({ field: 'email', message: 'Invalid email format' });
            } else if (checkUniqueness) {
                try {
                    const emailCheck = await this.checkEmailUniqueness(data.email, excludeId, excludeTable);
                    if (!emailCheck.isUnique) {
                        errors.push({ 
                            field: 'email', 
                            message: `Email already exists in ${emailCheck.existsIn}` 
                        });
                    }
                } catch (err) {
                    errors.push({ field: 'email', message: err.message });
                }
            }
        }

        // Phone validation
        if (data.phone !== undefined && data.phone !== null && data.phone !== '') {
            if (!this.isValidPhone(data.phone)) {
                errors.push({ field: 'phone', message: 'Invalid phone number format (10-20 digits)' });
            } else if (checkUniqueness) {
                try {
                    const phoneCheck = await this.checkPhoneUniqueness(data.phone, excludeId, excludeTable);
                    if (!phoneCheck.isUnique) {
                        errors.push({ 
                            field: 'phone', 
                            message: `Phone number already exists in ${phoneCheck.existsIn}` 
                        });
                    }
                } catch (err) {
                    errors.push({ field: 'phone', message: err.message });
                }
            }
        }

        // Parent email validation (for applications)
        if (data.parent_email || data.parentEmail) {
            const parentEmail = data.parent_email || data.parentEmail;
            if (!this.isValidEmail(parentEmail)) {
                errors.push({ field: 'parent_email', message: 'Invalid parent email format' });
            } else if (checkUniqueness) {
                try {
                    const emailCheck = await this.checkEmailUniqueness(parentEmail, excludeId, excludeTable);
                    if (!emailCheck.isUnique) {
                        errors.push({ 
                            field: 'parent_email', 
                            message: `Parent email already exists in ${emailCheck.existsIn}` 
                        });
                    }
                } catch (err) {
                    errors.push({ field: 'parent_email', message: err.message });
                }
            }
        }

        // Parent phone validation (for applications)
        if (data.parent_phone || data.parentPhone) {
            const parentPhone = data.parent_phone || data.parentPhone;
            if (!this.isValidPhone(parentPhone)) {
                errors.push({ field: 'parent_phone', message: 'Invalid parent phone number format' });
            } else if (checkUniqueness) {
                try {
                    const phoneCheck = await this.checkPhoneUniqueness(parentPhone, excludeId, excludeTable);
                    if (!phoneCheck.isUnique) {
                        errors.push({ 
                            field: 'parent_phone', 
                            message: `Parent phone number already exists in ${phoneCheck.existsIn}` 
                        });
                    }
                } catch (err) {
                    errors.push({ field: 'parent_phone', message: err.message });
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    /**
     * Display validation errors to user
     */
    showValidationErrors(errors) {
        if (!errors || errors.length === 0) return;
        
        const errorMessages = errors.map(err => `${err.field}: ${err.message}`).join('\n');
        
        if (typeof showToast === 'function') {
            errors.forEach(err => showToast(err.message, 'error'));
        } else if (typeof alert === 'function') {
            alert('Validation Errors:\n\n' + errorMessages);
        }
    }
};

// Register globally
window.validationManager = validationManager;
