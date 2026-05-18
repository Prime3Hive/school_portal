// Application Form Generator for TBD Academy
// Generates downloadable PDF application forms using jsPDF

(function () {
    'use strict';

    async function _loadJsPDF() {
        if (typeof window.jspdf !== 'undefined') return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Could not load PDF library. Please check your internet connection.'));
            document.body.appendChild(s);
        });
    }

    // Make function globally available
    window.generateApplicationForm = async function () {
        try {
            await _loadJsPDF();
        } catch (err) {
            showNotification(err.message, 'error');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        let yPos = margin;

        // Helper function to add text with word wrap
        function addText(text, x, y, maxWidth, fontSize = 10, isBold = false) {
            doc.setFontSize(fontSize);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            const lines = doc.splitTextToSize(text, maxWidth);
            doc.text(lines, x, y);
            return y + (lines.length * fontSize * 0.4);
        }

        // Helper function to draw a box for input
        function drawInputBox(x, y, width, height = 8) {
            doc.setDrawColor(100, 100, 100);
            doc.setLineWidth(0.3);
            doc.rect(x, y - 5, width, height);
        }

        // Header with school branding
        doc.setFillColor(34, 60, 120); // Navy blue
        doc.rect(0, 0, pageWidth, 35, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('TBD ACADEMY', pageWidth / 2, 15, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Excellence in Education, Character in Action', pageWidth / 2, 23, { align: 'center' });
        doc.text('Makurdi, Benue State, Nigeria', pageWidth / 2, 29, { align: 'center' });

        // Reset text color
        doc.setTextColor(0, 0, 0);
        yPos = 45;

        // Title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('STUDENT APPLICATION FORM', pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;

        // Derive current academic year dynamically (Sep onwards = new year)
        const _now = new Date();
        const _startYear = _now.getMonth() >= 8 ? _now.getFullYear() : _now.getFullYear() - 1;
        const _academicYear = (typeof AppConfig !== 'undefined' && AppConfig.school?.academicYear)
            || `${_startYear}/${_startYear + 1}`;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text(`Academic Year: ${_academicYear}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += 12;

        // Section 1: Student Information
        doc.setFillColor(220, 230, 240);
        doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SECTION A: STUDENT INFORMATION', margin + 2, yPos);
        yPos += 12;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        // Full Name
        doc.text('Full Name (Surname first):', margin, yPos);
        drawInputBox(margin + 60, yPos, pageWidth - 2 * margin - 60);
        yPos += 12;

        // Date of Birth and Gender
        doc.text('Date of Birth:', margin, yPos);
        drawInputBox(margin + 35, yPos, 40);
        doc.text('Gender:', margin + 85, yPos);
        drawInputBox(margin + 105, yPos, 30);
        yPos += 12;

        // Grade Applying For
        doc.text('Grade Applying For:', margin, yPos);
        drawInputBox(margin + 50, yPos, 60);
        doc.text('Preferred Section:', margin + 120, yPos);
        drawInputBox(margin + 160, yPos, 20);
        yPos += 12;

        // Place of Birth
        doc.text('Place of Birth:', margin, yPos);
        drawInputBox(margin + 35, yPos, pageWidth - 2 * margin - 35);
        yPos += 12;

        // Home Address
        doc.text('Home Address:', margin, yPos);
        yPos += 6;
        drawInputBox(margin, yPos, pageWidth - 2 * margin, 15);
        yPos += 20;

        // Section 2: Parent/Guardian Information
        doc.setFillColor(220, 230, 240);
        doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SECTION B: PARENT/GUARDIAN INFORMATION', margin + 2, yPos);
        yPos += 12;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        // Father's Information
        doc.setFont('helvetica', 'bold');
        doc.text('Father\'s Information:', margin, yPos);
        yPos += 8;
        doc.setFont('helvetica', 'normal');

        doc.text('Full Name:', margin, yPos);
        drawInputBox(margin + 30, yPos, pageWidth - 2 * margin - 30);
        yPos += 10;

        doc.text('Occupation:', margin, yPos);
        drawInputBox(margin + 30, yPos, 70);
        doc.text('Phone:', margin + 110, yPos);
        drawInputBox(margin + 130, yPos, 50);
        yPos += 10;

        doc.text('Email:', margin, yPos);
        drawInputBox(margin + 20, yPos, pageWidth - 2 * margin - 20);
        yPos += 14;

        // Mother's Information
        doc.setFont('helvetica', 'bold');
        doc.text('Mother\'s Information:', margin, yPos);
        yPos += 8;
        doc.setFont('helvetica', 'normal');

        doc.text('Full Name:', margin, yPos);
        drawInputBox(margin + 30, yPos, pageWidth - 2 * margin - 30);
        yPos += 10;

        doc.text('Occupation:', margin, yPos);
        drawInputBox(margin + 30, yPos, 70);
        doc.text('Phone:', margin + 110, yPos);
        drawInputBox(margin + 130, yPos, 50);
        yPos += 10;

        doc.text('Email:', margin, yPos);
        drawInputBox(margin + 20, yPos, pageWidth - 2 * margin - 20);
        yPos += 14;

        // Add new page
        doc.addPage();
        yPos = margin;

        // Section 3: Previous School Information
        doc.setFillColor(220, 230, 240);
        doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SECTION C: PREVIOUS SCHOOL INFORMATION', margin + 2, yPos);
        yPos += 12;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        doc.text('Previous School Name:', margin, yPos);
        drawInputBox(margin + 55, yPos, pageWidth - 2 * margin - 55);
        yPos += 10;

        doc.text('School Address:', margin, yPos);
        drawInputBox(margin + 40, yPos, pageWidth - 2 * margin - 40);
        yPos += 10;

        doc.text('Last Class Attended:', margin, yPos);
        drawInputBox(margin + 50, yPos, 60);
        doc.text('Year:', margin + 120, yPos);
        drawInputBox(margin + 135, yPos, 30);
        yPos += 14;

        // Section 4: Medical Information
        doc.setFillColor(220, 230, 240);
        doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SECTION D: MEDICAL INFORMATION', margin + 2, yPos);
        yPos += 12;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        doc.text('Blood Group:', margin, yPos);
        drawInputBox(margin + 35, yPos, 30);
        doc.text('Genotype:', margin + 75, yPos);
        drawInputBox(margin + 100, yPos, 30);
        yPos += 12;

        doc.text('Any Known Allergies:', margin, yPos);
        drawInputBox(margin + 50, yPos, pageWidth - 2 * margin - 50);
        yPos += 12;

        doc.text('Any Chronic Illness/Condition:', margin, yPos);
        drawInputBox(margin + 70, yPos, pageWidth - 2 * margin - 70);
        yPos += 14;

        // Section 5: Emergency Contact
        doc.setFillColor(220, 230, 240);
        doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SECTION E: EMERGENCY CONTACT', margin + 2, yPos);
        yPos += 12;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        doc.text('Contact Name:', margin, yPos);
        drawInputBox(margin + 40, yPos, pageWidth - 2 * margin - 40);
        yPos += 10;

        doc.text('Relationship:', margin, yPos);
        drawInputBox(margin + 35, yPos, 60);
        doc.text('Phone:', margin + 105, yPos);
        drawInputBox(margin + 125, yPos, 55);
        yPos += 14;

        // Section 6: Declaration
        doc.setFillColor(220, 230, 240);
        doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SECTION F: DECLARATION', margin + 2, yPos);
        yPos += 12;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const declaration = 'I hereby declare that the information provided above is true and accurate to the best of my knowledge. I understand that providing false information may result in the cancellation of this application. I agree to abide by the rules and regulations of TBD Academy.';
        yPos = addText(declaration, margin, yPos, pageWidth - 2 * margin, 9);
        yPos += 10;

        doc.setFontSize(10);
        doc.text('Parent/Guardian Signature:', margin, yPos);
        drawInputBox(margin + 60, yPos, 60);
        doc.text('Date:', margin + 130, yPos);
        drawInputBox(margin + 145, yPos, 35);
        yPos += 15;

        // Footer
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text('For Official Use Only:', margin, yPos);
        yPos += 5;
        doc.text('Application ID: ___________________', margin, yPos);
        doc.text('Date Received: ___________________', margin + 70, yPos);
        yPos += 5;
        doc.text('Received By: ___________________', margin, yPos);
        doc.text('Status: ___________________', margin + 70, yPos);

        // Add footer on all pages
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`TBD Academy Application Form - Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            const _schoolPhone = (typeof AppConfig !== 'undefined' && AppConfig.school?.phone) || '+234 803 123 4567';
            doc.text(`info@tbdacademy.edu.ng | ${_schoolPhone}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }

        // Save the PDF
        const fileName = `TBD_Academy_Application_Form_${new Date().getTime()}.pdf`;
        doc.save(fileName);

        // Show success message
        showNotification('Application form downloaded successfully! Please fill it out and upload it back.', 'success');
    };

    // Helper function to show notifications
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: ${type === 'success' ? 'hsl(150, 70%, 45%)' : 'hsl(200, 90%, 55%)'};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease;
      max-width: 300px;
    `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // Add animations
    const style = document.createElement('style');
    style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
    document.head.appendChild(style);

})();
