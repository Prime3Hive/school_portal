# TBD Academy Portal

**Live Site**: [Coming Soon - Deploy to Netlify]

Excellence in Education, Character in Action. A comprehensive school management portal for TBD Academy, Makurdi, Benue State.

## 🌐 Public Website

Visit our public website to learn about TBD Academy:
- School information and programs
- Admissions and application process
- Contact information

**Entry Point**: `public-blog.html`

## 👨‍💼 Staff Portal

Secure portal for school administrators and staff:
- Student management
- Staff management
- Class scheduling
- Fees & payments
- Inventory management
- Assessments & grading
- Application management

**Entry Point**: `index.html`

## 🚀 Features

### Public Site
- ✅ Responsive design for all devices
- ✅ Modern UI with TBD Academy branding
- ✅ Downloadable PDF application forms
- ✅ Online application submission
- ✅ Application status tracking
- ✅ Contact form

### Admin Portal
- ✅ Comprehensive dashboard
- ✅ Student directory with photo management
- ✅ Staff management
- ✅ Class scheduling
- ✅ Fees & payments with Paystack integration
- ✅ Inventory tracking
- ✅ Assessments & grading system
- ✅ Application review & approval
- ✅ Expense tracking

## 📦 Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **PDF Generation**: jsPDF
- **Data Export**: SheetJS
- **Payment**: Paystack
- **Storage**: localStorage (demo) - needs backend for production
- **Hosting**: Netlify

## 🛠️ Local Development

1. **Clone or download** the repository
2. **Start a local server**:
   ```bash
   python -m http.server 8000
   ```
3. **Open in browser**:
   - Public site: `http://localhost:8000/public-blog.html`
   - Admin portal: `http://localhost:8000/index.html`

## 📝 Deployment to Netlify

### Option 1: Drag & Drop (Easiest)
1. Zip the entire `School portal` folder
2. Go to [Netlify Drop](https://app.netlify.com/drop)
3. Drag and drop the zip file
4. Wait for deployment to complete
5. Your site is live!

### Option 2: Git Integration
1. Initialize git repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. Push to GitHub/GitLab/Bitbucket
3. Connect repository to Netlify
4. Configure build settings (already set in `netlify.toml`)
5. Deploy!

### Option 3: Netlify CLI
1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```
2. Login to Netlify:
   ```bash
   netlify login
   ```
3. Deploy:
   ```bash
   netlify deploy --prod
   ```

## ⚙️ Configuration

### Netlify Settings
All configuration is in `netlify.toml`:
- Build settings
- Redirects for SPA routing
- Security headers
- Cache policies

### Environment Variables (Optional)
For production, consider adding:
- `PAYSTACK_PUBLIC_KEY` - Your Paystack public key
- `CONTACT_EMAIL` - Email for contact form submissions

## 📱 Pages

### Public Site
- `/public-blog.html` - Homepage
- `/about.html` - About TBD Academy
- `/academics.html` - Academic programs
- `/admissions.html` - Admissions & applications
- `/contact.html` - Contact information

### Admin Portal
- `/index.html` - Admin dashboard
- All modules accessible via navigation

## 🔒 Security Notes

**IMPORTANT**: This is a demo application using localStorage for data persistence.

For production deployment, you MUST:
1. ✅ Implement backend API (Node.js/Express recommended)
2. ✅ Add database (PostgreSQL/MongoDB)
3. ✅ Implement authentication & authorization
4. ✅ Add HTTPS (Netlify provides this automatically)
5. ✅ Secure API endpoints
6. ✅ Implement CSRF protection
7. ✅ Add rate limiting
8. ✅ Sanitize user inputs

## 📊 Data Storage

**Current**: Browser localStorage (suitable for demo only)

**Production Recommendation**:
- Backend: Node.js with Express
- Database: PostgreSQL or MongoDB
- Authentication: JWT or session-based
- File Storage: AWS S3 or Cloudinary for uploads

## 🎨 Customization

### Branding
Update school information in:
- `js/school-config.js` - School details, grades, fees
- `css/design-system.css` - Colors and styling
- `css/public-blog.css` - Public site styling

### Contact Information
Update in all HTML files:
- Phone numbers
- Email addresses
- Physical address
- Social media links

## 📚 Documentation

- **Quick Start Guide**: `BLOG_QUICK_START.md`
- **Implementation Plan**: See artifacts folder
- **Walkthrough**: See artifacts folder

## 🐛 Known Limitations

1. **No Backend**: Uses localStorage (not suitable for production)
2. **No Authentication**: Admin portal has no login (needs implementation)
3. **No Email Notifications**: Simulated only (needs backend integration)
4. **File Storage**: Base64 in localStorage (needs proper file storage)
5. **No Database**: All data in browser (needs backend database)

## 🚀 Future Enhancements

- [ ] Backend API development
- [ ] User authentication system
- [ ] Email/SMS notifications
- [ ] Real-time updates
- [ ] Advanced reporting
- [ ] Mobile app
- [ ] Parent portal
- [ ] Teacher portal
- [ ] Student portal

## 📞 Support

For questions or support:
- **Email**: info@tbdacademy.edu.ng
- **Phone**: +234 XXX XXX XXXX
- **Location**: Makurdi, Benue State, Nigeria

## 📄 License

© 2026 TBD Academy. All rights reserved.

---

**Built with ❤️ for Excellence in Education**
