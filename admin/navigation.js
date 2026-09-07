/**
 * The admin menu, in one place.
 *
 * This lived inside AdminSidebar, so the dashboard could not offer the same
 * destinations without restating them -- and a restated menu is a menu that
 * drifts: a page added to one and not the other is invisible from half the
 * app, with nothing to catch it. Both now read this.
 *
 * Each item carries a `description` because the dashboard renders cards, and a
 * card with only a label makes the reader guess. They are written to say what
 * the page LETS YOU DO, not what it is called again in longer words -- "Approve
 * and monitor merchant accounts" rather than "Manage merchants".
 *
 * `accent` drives the card's icon tint. Assigned per group so a section reads
 * as one family at a glance, rather than a different colour per card, which
 * turns a grid into confetti.
 *
 * Access is NOT filtered here. Both consumers pass the result through
 * hasPageAccess(), so the roles table stays the single authority on who sees
 * what; this module only describes what exists.
 */

import {
  Activity,
  Award,
  BarChart3,
  Coins,
  CreditCard,
  FileVideo,
  Flag,
  Gift as GiftIcon,
  Key,
  LayoutDashboard,
  LifeBuoy,
  Trophy,
  Users,
  Zap as ChargingIcon,
  Crown,
  Building2,
} from "lucide-react";

export const NAV_SECTIONS = [
  {
    label: "Overview",
    accent: "#3B82F6",
    items: [
      {
        id: "dashboard",
        icon: LayoutDashboard,
        label: "Dashboard",
        description:
          "Platform totals at a glance, with today’s movement on each.",
      },
      {
        id: "analytics",
        icon: BarChart3,
        label: "Analytics",
        description: "Growth, engagement and retention trends over time.",
      },
    ],
  },
  {
    label: "Operations",
    accent: "#8B5CF6",
    items: [
      {
        id: "reports",
        icon: Flag,
        label: "Reports",
        description: "Review reported posts and act on moderation queues.",
      },
      {
        id: "support",
        icon: LifeBuoy,
        label: "Support Requests",
        description: "Read and respond to requests raised by users.",
      },
    ],
  },
  {
    label: "Content",
    accent: "#10B981",
    items: [
      {
        id: "users",
        icon: Users,
        label: "Users",
        description:
          "Search accounts, inspect activity and apply restrictions.",
      },
      {
        id: "content",
        icon: FileVideo,
        label: "Content",
        description: "Browse every post, with moderation and removal tools.",
      },
      {
        id: "organizations",
        icon: Building2,
        label: "Organizations",
        description:
          "Companies running campaigns, and the administrators who manage them.",
      },
      {
        id: "master-campaigns",
        icon: Trophy,
        label: "Master Campaigns",
        description:
          "Create the parent campaigns that sub-campaigns run under.",
      },
      {
        id: "campaigns",
        icon: Award,
        label: "Sub-Campaigns",
        description: "Run individual campaigns, their themes and scoring.",
      },
    ],
  },
  {
    label: "Monetization",
    accent: "#F59E0B",
    items: [
      {
        id: "gifts",
        icon: GiftIcon,
        label: "Gifts",
        description: "Configure the gift catalogue and its coin values.",
      },
      {
        id: "coins",
        icon: Coins,
        label: "Coin Management",
        description:
          "Packages, engagement costs and manual balance adjustments.",
      },
      {
        id: "organization-coins",
        icon: Coins,
        label: "Organization Coins",
        description:
          "Per-organization reward rates, campaign budgets and global ceilings.",
      },
      {
        id: "withdrawal-analytics",
        icon: Activity,
        label: "Withdrawal Analytics",
        description: "Track payout volume and settlement status.",
      },
      {
        id: "subscriptions",
        icon: CreditCard,
        label: "Subscriptions",
        description: "Tiers, active subscribers and payment history.",
      },
      {
        id: "charging",
        icon: ChargingIcon,
        label: "On-Demand Charging",
        description: "Airtime purchases and their charging transactions.",
      },
      {
        id: "crm-winners",
        icon: Crown,
        label: "Winner Gifts",
        description: "Award and track data gifts issued to campaign winners.",
      },
    ],
  },
  // {
  //   label: "System",
  //   accent: "#EF4444",
  //   items: [
  //     {
  //       id: "notifications",
  //       icon: Bell,
  //       label: "Notifications",
  //       description: "Compose and send push notifications to segments.",
  //     },
  //     {
  //       id: "admins",
  //       icon: Shield,
  //       label: "Admins",
  //       description: "Create admin accounts and assign their roles.",
  //     },
  //     {
  //       id: "security-monitoring",
  //       icon: Shield,
  //       label: "Security Monitoring",
  //       description: "Live security events and unresolved incidents.",
  //     },
  //     {
  //       id: "api-keys",
  //       icon: Key,
  //       label: "API Keys",
  //       description: "Issue and revoke keys for external integrations.",
  //     },
  //     {
  //       id: "security",
  //       icon: Lock,
  //       label: "Security",
  //       description: "Password policy, session rules and access controls.",
  //     },
  //     {
  //       id: "legal",
  //       icon: Scale,
  //       label: "Legal Docs",
  //       description: "Publish terms and privacy policy, and track acceptance.",
  //     },
  //     {
  //       id: "logs",
  //       icon: FileText,
  //       label: "Logs",
  //       description: "Audit trail of administrative actions.",
  //     },
  //     {
  //       id: "settings",
  //       icon: Settings,
  //       label: "Settings",
  //       description: "Branding, fonts and platform-wide configuration.",
  //     },
  //   ],
  // },
];

/**
 * The sections a role may see, with empty ones dropped.
 *
 * Shared so the sidebar and the dashboard can never disagree about which
 * destinations exist for a given admin -- a card leading to a page the role
 * cannot open is worse than no card at all.
 */
export function visibleSections(hasPageAccess, userRole) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasPageAccess(userRole, item.id)),
  })).filter((section) => section.items.length > 0);
}
