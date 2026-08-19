# Data collection — TBD International Academy

Sheets for loading the school's existing records into the portal.
Generated 19 August 2026 from the school's own documents.

## For the school office

Open the three files in `templates/` with Excel or Google Sheets.
**Columns that are already filled came from your documents — don't retype them.**
Only fill the blank columns.

| File | Rows | What to fill in |
|---|---|---|
| `students-collection.csv` | 88 pupils | Date of birth, gender, guardian name and contact, admission date |
| `staff-collection.csv` | 15 staff | Email, monthly salary, hire date, subjects taught |
| `families-collection.csv` | 22 households | One set of guardian contacts per family, not per child |
| `review-links.csv` | 4 rows | Four pupils whose family is uncertain — confirm or correct |

### Fill the families sheet first

53 of the 88 pupils appear to belong to 22 households with more than one child.
Filling `families-collection.csv` first means **57 sets of contact details
instead of 88**. Then only the pupils with a blank `family_group` need their
guardian entered individually on the students sheet.

### The two columns that matter most

- **`guardian_email`** — without it that family cannot be given a portal login.
  A guardian with no email can still have their children loaded; they just
  can't sign in yet.
- **`gross_salary_monthly`** — the *constant* figure only. Do not enter
  deductions: they change month to month, and the portal stores one figure per
  member of staff.

### Names

The population list mixes two orders. Most rows read SURNAME FIRSTNAME
("ABEL KYLA"), but a few read FIRSTNAME SURNAME ("BERNICE AKPIRI"). Please
split each name into the `surname` / `first_name` / `other_names` columns so
the portal shows and sorts them correctly. Leave `name_as_written` untouched —
it's how the import matches your sheet back to the original list.

`family_group` is a **guess** based on shared surnames. Correct it where it's
wrong and clear it where two families happen to share a surname.

## For whoever runs the import

```bash
node scripts/import/build-templates.js     # regenerate the blank sheets
```

`source-data.js` holds the transcription of the source documents. Fix a
mis-typed name there and regenerate — never hand-edit the CSVs in `templates/`,
because regenerating overwrites them.

### Still outstanding before anything can be imported

1. **Staff salaries.** `STAFF LIST.docx` has no salary or deduction data —
   only name, designation and phone. The payroll sheet is a separate document
   that hasn't been supplied.
2. **Basic 1-3 new-intake uniform.** The fee sheet's line items add to ₦84,000
   but the stated total is ₦85,800. The gap is ₦1,800 on the uniform row, which
   reads ₦25,000 where every other class's total implies ₦26,800. Awaiting
   confirmation.
3. **A Supabase service-role key** in `.env` (never committed).
4. **A database backup**, taken before the first `--apply`.

### Facts established so far

- Fees are charged **per term**; a session is three terms.
- Creche tuition is quoted monthly (₦10,000 × 3 months = ₦30,000 per term),
  which is what makes its ₦34,500 term total reconcile.
- Guardians get portal logins. Pupils do not.
- No opening balances: students start clean and are charged for the current
  term via the portal's existing "Assign Fees".
