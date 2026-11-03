// One place for the facts that appear on many pages. Edit here, not in components.
// Everything below is fictional: this is a portfolio demo.

export const site = {
  name: 'Kilnworth Precision',
  legalName: 'Kilnworth Precision Machining, Inc.',
  tagline: 'Contract CNC machining in Pennsylvania since 1987',
  description:
    'Contract CNC machine shop: 5-axis milling, Swiss-type turning, wire EDM and CMM inspection for medical, aerospace and automation parts. Prototypes to 10,000 pieces.',
  founded: 1987,
  employees: 40,

  // Fictional contact details. 555-01xx numbers are reserved for fiction in North America.
  phone: { display: '(610) 555-0147', href: 'tel:+16105550147' },
  email: 'quotes@kilnworth.example',
  address: {
    street: '1420 Kiln Run Road',
    city: 'Birdsboro',
    region: 'PA',
    postalCode: '19508',
    country: 'US',
  },
  hours: 'Mon–Fri, 6:30 am – 4:30 pm ET',
  quoteTurnaround: '2 working days',

  // Demo flags. Set `demo: false` and `noindex: false` only for a real client launch.
  demo: true,
  noindex: true,
  demoBy: 'Nikita Tarashenko', // shown as "Demo by ..." in the demo strip and footer

  // Default unit system for dimensions; visitors can switch, the choice is stored in localStorage.
  defaultUnit: 'in' as 'in' | 'mm',
} as const;

export const nav = [
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/work', label: 'Work' },
  { href: '/quality', label: 'Quality' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const footerNav = [
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/materials', label: 'Materials' },
  { href: '/industries', label: 'Industries' },
  { href: '/quality', label: 'Quality' },
  { href: '/work', label: 'Work' },
  { href: '/resources', label: 'Resources' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
] as const;
