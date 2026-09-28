// Festival and observance dates for the Indian social media calendar page.
// Holidays are from the Government of India's DoPT holiday lists: the 2026 list
// (O.M. F.No.12/2/2023-JCA dated 3 July 2025) and the 2027 list (O.M. dated
// 16 July 2026), gazetted and restricted (Delhi/New Delhi). Fixed-date
// observances need no source. Checked 28 Sep 2026. The same rows are published
// as public/social-media-calendar-india-2026-27.csv - regenerate both together.
export type CalendarKind = 'Gazetted holiday' | 'Restricted holiday' | 'Fixed-date observance';
export interface CalendarRow { date: string; weekday: string; occasion: string; kind: CalendarKind; idea: string }
export const CALENDAR: CalendarRow[] = [
  {
    "date": "2026-10-02",
    "weekday": "Fri",
    "occasion": "Gandhi Jayanti",
    "kind": "Gazetted holiday",
    "idea": "A quote or value from Gandhi tied to how your business works. Avoid discount-led posts on this day."
  },
  {
    "date": "2026-10-20",
    "weekday": "Tue",
    "occasion": "Dussehra (Vijaya Dashami)",
    "kind": "Gazetted holiday",
    "idea": "Good-over-evil framing: a problem your product fixes. Navratri runs for the nine nights before it, so a 9-post series works."
  },
  {
    "date": "2026-10-26",
    "weekday": "Mon",
    "occasion": "Maharishi Valmiki Jayanti",
    "kind": "Restricted holiday",
    "idea": "Regional audiences in North India. A short greeting is enough."
  },
  {
    "date": "2026-10-29",
    "weekday": "Thu",
    "occasion": "Karwa Chauth",
    "kind": "Restricted holiday",
    "idea": "Gifting, fashion, beauty and food brands. Schedule the post for the morning; the fast ends at moonrise."
  },
  {
    "date": "2026-11-08",
    "weekday": "Sun",
    "occasion": "Diwali",
    "kind": "Gazetted holiday",
    "idea": "Your biggest greeting of the year. Schedule the sale teaser 7-10 days out and the greeting for the morning of the day."
  },
  {
    "date": "2026-11-09",
    "weekday": "Mon",
    "occasion": "Govardhan Puja",
    "kind": "Restricted holiday",
    "idea": "Follow-up greeting; also a natural day to thank customers after Diwali."
  },
  {
    "date": "2026-11-11",
    "weekday": "Wed",
    "occasion": "Bhai Dooj",
    "kind": "Restricted holiday",
    "idea": "Sibling-gifting angle for retail and D2C brands."
  },
  {
    "date": "2026-11-14",
    "weekday": "Sat",
    "occasion": "Children's Day",
    "kind": "Fixed-date observance",
    "idea": "Education, toys, kids’ food and family brands. Throwback photos from your team work well."
  },
  {
    "date": "2026-11-15",
    "weekday": "Sun",
    "occasion": "Chhath Puja",
    "kind": "Restricted holiday",
    "idea": "Important in Bihar, Jharkhand and eastern UP. Localise if you have audiences there."
  },
  {
    "date": "2026-11-24",
    "weekday": "Tue",
    "occasion": "Guru Nanak Jayanti",
    "kind": "Gazetted holiday",
    "idea": "A respectful greeting. Keep product promotion out of it."
  },
  {
    "date": "2026-12-24",
    "weekday": "Thu",
    "occasion": "Christmas Eve",
    "kind": "Restricted holiday",
    "idea": "Gift-guide and last-order-date posts for delivery businesses."
  },
  {
    "date": "2026-12-25",
    "weekday": "Fri",
    "occasion": "Christmas",
    "kind": "Gazetted holiday",
    "idea": "Greeting plus a year-end offer if you run one."
  },
  {
    "date": "2026-12-31",
    "weekday": "Thu",
    "occasion": "New Year's Eve",
    "kind": "Fixed-date observance",
    "idea": "Year-in-review carousel: numbers, launches, thank-yous."
  },
  {
    "date": "2027-01-01",
    "weekday": "Fri",
    "occasion": "New Year's Day",
    "kind": "Restricted holiday",
    "idea": "Plans or resolutions for your customers, not for you."
  },
  {
    "date": "2027-01-12",
    "weekday": "Tue",
    "occasion": "National Youth Day",
    "kind": "Fixed-date observance",
    "idea": "Swami Vivekananda’s birth anniversary. Students, education and career audiences."
  },
  {
    "date": "2027-01-14",
    "weekday": "Thu",
    "occasion": "Makar Sankranti / Magh Bihu",
    "kind": "Restricted holiday",
    "idea": "Kites and harvest imagery; the festival has different names by state, so localise the greeting."
  },
  {
    "date": "2027-01-15",
    "weekday": "Fri",
    "occasion": "Pongal / Guru Gobind Singh Jayanti",
    "kind": "Restricted holiday",
    "idea": "Tamil audiences for Pongal; Sikh audiences for Guru Gobind Singh Jayanti. Two separate, respectful greetings."
  },
  {
    "date": "2027-01-26",
    "weekday": "Tue",
    "occasion": "Republic Day",
    "kind": "Gazetted holiday",
    "idea": "Made-in-India and constitution themes. Many brands run sales; decide early if you will."
  },
  {
    "date": "2027-02-11",
    "weekday": "Thu",
    "occasion": "Basant Panchami",
    "kind": "Restricted holiday",
    "idea": "Yellow palette, learning and new beginnings. Suits education brands."
  },
  {
    "date": "2027-02-14",
    "weekday": "Sun",
    "occasion": "Valentine's Day",
    "kind": "Fixed-date observance",
    "idea": "Gifting, food and experiences. Schedule the week-long run-up from 7 February."
  },
  {
    "date": "2027-03-06",
    "weekday": "Sat",
    "occasion": "Maha Shivratri",
    "kind": "Restricted holiday",
    "idea": "A respectful greeting. Keep promotion light."
  },
  {
    "date": "2027-03-08",
    "weekday": "Mon",
    "occasion": "International Women's Day",
    "kind": "Fixed-date observance",
    "idea": "Spotlight the women on your team or among your customers, with their permission."
  },
  {
    "date": "2027-03-10",
    "weekday": "Wed",
    "occasion": "Id-ul-Fitr (subject to moon sighting)",
    "kind": "Gazetted holiday",
    "idea": "Greeting on the day. The date can move by a day, so keep a draft ready for both."
  },
  {
    "date": "2027-03-22",
    "weekday": "Mon",
    "occasion": "Holika Dahan",
    "kind": "Restricted holiday",
    "idea": "Teaser for Holi content the next day."
  },
  {
    "date": "2027-03-23",
    "weekday": "Tue",
    "occasion": "Holi",
    "kind": "Gazetted holiday",
    "idea": "Colour-heavy creatives and short video. One of the most shared festival days of the year."
  }
];
