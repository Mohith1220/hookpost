// The role pages under /for, read by the (roles) layout for the "other roles"
// strip under every role page. The /for hub keeps its own richer card list.
//
// Before the strip existed, each of these fifteen pages had exactly one inbound
// internal link - the hub card - so crawlers treated them as near-orphans
// (site crawl, 28 Sep 2026). Add a new role page here and to the hub.
export const ROLE_LINKS: { slug: string; label: string }[] = [
  { slug: 'creators', label: 'Creators & influencers' },
  { slug: 'agencies', label: 'Agencies' },
  { slug: 'small-business', label: 'Small businesses' },
  { slug: 'solopreneurs-freelancers', label: 'Freelancers' },
  { slug: 'ecommerce', label: 'E-commerce brands' },
  { slug: 'b2b-saas', label: 'B2B SaaS' },
  { slug: 'real-estate', label: 'Real estate' },
  { slug: 'restaurants-cafes', label: 'Restaurants & cafes' },
  { slug: 'fitness-coaches', label: 'Fitness coaches' },
  { slug: 'healthcare-clinics', label: 'Clinics' },
  { slug: 'music-artists', label: 'Musicians' },
  { slug: 'crypto-web3', label: 'Web3 projects' },
  { slug: 'educators-nonprofits', label: 'Educators & nonprofits' },
  { slug: 'students-young-creators', label: 'Students' },
  { slug: 'enterprise-teams', label: 'Enterprise teams' },
];
