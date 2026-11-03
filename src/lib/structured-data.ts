// JSON-LD builders. Values come from config/site.ts, so contact changes happen in one place.
import { site } from '../config/site';

export const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: site.name,
  legalName: site.legalName,
  description: site.description,
  foundingDate: String(site.founded),
  telephone: site.phone.href.replace('tel:', ''),
  email: site.email,
  address: {
    '@type': 'PostalAddress',
    streetAddress: site.address.street,
    addressLocality: site.address.city,
    addressRegion: site.address.region,
    postalCode: site.address.postalCode,
    addressCountry: site.address.country,
  },
  url: import.meta.env.SITE,
});
