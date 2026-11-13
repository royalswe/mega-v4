import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getDictionary } from '@/lib/dictionaries'
import { TRUST_LEVEL_THRESHOLDS } from '@/lib/community/reputation'

/**
 * Qualitative descriptions for each trust level, in the same order as
 * `TRUST_LEVEL_THRESHOLDS`. The public page deliberately avoids exposing the
 * numeric bands so progression cannot be reduced to a target to grind.
 */
const trustLevelNotes = [
  'Just getting started — the default for new accounts.',
  'Consistent participation is starting to show.',
  'A dependable contributor the community responds to.',
  'Strong, sustained contribution and interaction.',
  'Long-running, high-quality participation.',
  'Helps shape what the community sees.',
  'A defining voice in the community.',
  'The highest level — exceptional sustained standing.',
]

const pointClassGuides = [
  {
    name: 'Interaction Points',
    description:
      'Reward daily participation, voting, commenting, sharing, and other community actions.',
    examples: 'Logins, comments, votes, shares, and other positive interactions.',
  },
  {
    name: 'Likability Points',
    description:
      'Reward content that the community likes, comments on, shares, and responds to positively.',
    examples: 'Upvoted posts, well-received comments, and other appreciated contributions.',
  },
  {
    name: 'Contribution Points',
    description: 'Reward original content creation across links, posts, media, and articles.',
    examples: 'Posts, links, videos, images, and articles that attract real engagement.',
  },
  {
    name: 'Cleaning Points',
    description: 'Reward reports and cleanup work that helps remove spam and improve site quality.',
    examples: 'Approved reports, moderation wins, typo fixes, broken-link cleanup, and tag work.',
  },
  {
    name: 'Discovery Points',
    description: 'Reward being early to spot content that later becomes popular or influential.',
    examples: 'Early discovery of rising links, resurrected old gems, and breakout posts.',
  },
  {
    name: 'Recruiter Points',
    description: 'Reward bringing new members into the ecosystem and growing active communities.',
    examples: 'SubFeed growth and high-quality member acquisition.',
  },
  {
    name: 'Security Points',
    description: 'Reward stronger account security and responsible security reporting.',
    examples: 'Verified email, safe password setup, 2FA, and security issue reporting.',
  },
]

const roleGuides = [
  {
    role: 'User',
    description:
      'Default account role with normal posting, voting, commenting, bookmarking, and reporting access.',
    howToAchieve: 'Created automatically when you sign up and remains the baseline role.',
  },
  {
    role: 'Uploader',
    description: 'Can publish links, images, video, and other media directly into the Main Feed.',
    howToAchieve:
      'Derived automatically from contribution and discovery signals once you reach Recognized standing. Kept while those signals stay strong; relaxed back if they fade.',
  },
  {
    role: 'Moderator',
    description: 'Can review reports, remove content, and manage moderation workflows.',
    howToAchieve:
      'Derived automatically from high cleaning and security signals while your activity stays recent. Retained with a grace margin, then relaxed if the signals fall.',
  },
  {
    role: 'Editor',
    description: 'Can publish editorial content and announcements directly into the Main Feed.',
    howToAchieve:
      'Derived automatically from strong contribution and interaction signals at Trusted standing or above. Retained while you remain active and contributing.',
  },
  {
    role: 'Cleaner',
    description:
      'Can help keep the platform clean by earning trust through verified cleanup and reports.',
    howToAchieve:
      'Derived automatically from cleaning signals and trusted activity patterns; kept while cleanup work continues.',
  },
  {
    role: 'Recruiter',
    description:
      'Recognizes users who help grow communities and SubFeeds by bringing in new members.',
    howToAchieve:
      'Derived automatically from recruiter signals and sustained contribution behaviour; kept while growth continues.',
  },
  {
    role: 'Admin',
    description:
      'Operational and emergency-safety permissions, including standing freezes and role rollbacks.',
    howToAchieve:
      'Granted manually by an existing Admin; this is not auto-derived. Admin is the one role that never expires.',
  },
]

const localRoleGuides = [
  {
    role: 'Owner',
    description:
      'The member who created the SubFeed. Always has full local control of the SubFeed.',
  },
  {
    role: 'Moderator',
    description: 'Can moderate SubFeed content and manage the local roster.',
  },
  {
    role: 'Editor',
    description: 'Can curate SubFeed content, but cannot change the roster.',
  },
  {
    role: 'Uploader',
    description: 'Can publish links and posts into the SubFeed.',
  },
  {
    role: 'Member',
    description:
      'Can follow the SubFeed, comment, vote, and take part in its discussions. Membership alone does not grant publishing permission.',
  },
]

export const metadata: Metadata = {
  title: 'How V4 Works',
}

export default async function HowItWorksPage() {
  const { lang } = await getDictionary()

  if (lang === 'sv') {
    redirect('/hur-det-funkar')
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold">How V4 Works</h1>
        <p className="text-muted-foreground max-w-3xl">
          V4 is designed to be dynamic and self-regulating. Standing, roles, SubFeed access, and
          Main Feed promotion are all driven by what the community actually does — not by a fixed
          hierarchy or a handful of manual decisions. This page explains the mechanics behind that.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Personal-First Publishing</h2>
        <Card>
          <CardHeader>
            <CardTitle>Start in Your Public User Feed</CardTitle>
            <CardDescription>
              Every member can publish right away. A SubFeed is an editorial space you earn, not a
              prerequisite for contributing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Every new link or post starts in your own{' '}
                <span className="font-medium">public User Feed</span> as soon as safety checks
                allow. Other members can read it, vote on it, and comment on it.
              </li>
              <li>
                Community engagement — votes, comments, clicks, discovery boosts, or an editorial
                feature — can lift eligible User Feed content{' '}
                <span className="font-medium">directly into the Main Feed</span>. A SubFeed is not a
                mandatory rung on the way up.
              </li>
              <li>
                SubFeeds are earned editorial spaces.{' '}
                <span className="font-medium">
                  Joining a SubFeed as a member lets you follow it and take part in discussions, but
                  does not grant publishing permission there.
                </span>{' '}
                Publishing into a SubFeed requires a local publishing role: Owner, Moderator,
                Editor, or Uploader.
              </li>
              <li>
                Site-wide roles (Admin, Moderator, Editor, Uploader) can additionally publish
                straight to the Main Feed.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Point Classes</h2>
        <Card>
          <CardHeader>
            <CardTitle>How Activity Becomes Reputation</CardTitle>
            <CardDescription>
              The system tracks several point classes and rolls them up into a hidden standing score
              and a public trust label.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Public-facing reputation is intentionally simplified. Internally, your standing is a
              weighted blend of discovery, contribution, likability, interaction, cleaning,
              recruiter, legacy contribution, and security signals. Every point class is earned
              through activity — nothing is assigned by hand.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {pointClassGuides.map((pointClass) => (
                <div key={pointClass.name} className="rounded-lg border p-4 space-y-2">
                  <h3 className="font-medium">{pointClass.name}</h3>
                  <p className="text-muted-foreground">{pointClass.description}</p>
                  <p>{pointClass.examples}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Standing, Decay & Trust Levels</h2>

        <Card>
          <CardHeader>
            <CardTitle>Your Standing Is Alive</CardTitle>
            <CardDescription>
              Trust is not a one-time badge. It rises with contribution and cools down when you go
              quiet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Hidden standing blends your point classes with discovery and contribution weighted
              most heavily, followed by likability and interaction, then cleaning, recruiter, legacy
              contribution, and security signals. The exact weights stay internal so the system
              cannot be gamed; what matters is that sustained, well-received activity raises your
              standing.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Recency decay.</span> Your effective standing keeps
                halving the longer you stay inactive. Returning and contributing again brings it
                back up.
              </li>
              <li>
                <span className="font-medium">Cold-start floor.</span> Any member with genuine
                activity in the last 30 days keeps a modest baseline of effective standing — enough
                to get started without letting fresh accounts farm higher levels.
              </li>
              <li>
                <span className="font-medium">No permanent plateau.</span> Because standing decays,
                trust levels can move both up and down. The community&apos;s collective activity
                keeps the whole system in motion.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trust Level Thresholds</CardTitle>
            <CardDescription>
              Your effective standing maps to one of these public trust labels.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Level</th>
                    <th className="text-left py-2">What It Reflects</th>
                  </tr>
                </thead>
                <tbody>
                  {TRUST_LEVEL_THRESHOLDS.map((level, index) => (
                    <tr key={level.value} className="border-b last:border-0">
                      <td className="py-2 pr-4">{level.label}</td>
                      <td className="py-2">{trustLevelNotes[index]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground">
              These are reference points, not permanent achievements. Your effective standing after
              decay is what decides your level today. Thresholds also adapt to how many members hold
              each level, so a crowded level becomes harder to reach and relaxes again as activity
              drops.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stability Without Stagnation</CardTitle>
            <CardDescription>
              Hysteresis keeps members from flickering between levels at a boundary, while still
              allowing genuine movement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Promotion to a higher trust level requires clearing its threshold with a small
                margin to spare.
              </li>
              <li>
                Demotion only happens once your standing falls clearly below your current
                level&apos;s threshold.
              </li>
              <li>
                Earned roles have their own grace margin: an existing role is retained while you
                keep most of its promotion gate, with one trust level of relaxation.
              </li>
              <li>
                If a role&apos;s signals fade past that margin, the role relaxes back automatically
                — it is not revoked permanently.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Site Roles</h2>
        <div className="grid gap-4">
          {roleGuides.map((role) => (
            <Card key={role.role}>
              <CardHeader>
                <CardTitle>{role.role}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{role.description}</p>
                <p>
                  <span className="font-medium">How to achieve:</span> {role.howToAchieve}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Automatic Progression</h2>
        <Card>
          <CardContent className="space-y-2 py-6 text-sm">
            <p>
              Most elevated roles are not manually assigned. They are derived from your current
              point classes, effective standing, and recent activity.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Inactivity decays your standing and can relax earned roles if you go inactive.
              </li>
              <li>
                Roles are retained with a grace margin before relaxing, so short quiet spells do not
                cost you your standing.
              </li>
              <li>
                Admin is the exception and must still be granted manually; it never expires
                automatically.
              </li>
              <li>
                The public profile shows your trust label and earned roles instead of exposing the
                raw internal score.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">SubFeeds</h2>

        <Card>
          <CardHeader>
            <CardTitle>SubFeeds Are Earned, Not Open</CardTitle>
            <CardDescription>
              SubFeeds compete directly with the Main Feed, so creating one requires proven
              community standing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Every account already has a User Feed. A SubFeed is different: it is a separate
              editorial space that can compete for Main Feed attention. To keep it exclusive, you
              must meet <span className="font-medium">any one</span> of these paths:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Uploader candidacy:</span> strong Contribution Points,
                or a blend of Contribution and Discovery Points at Recognized standing.
              </li>
              <li>
                <span className="font-medium">Editor candidacy:</span> stronger Contribution Points,
                or a blend of Contribution and Interaction Points at Trusted standing.
              </li>
              <li>
                <span className="font-medium">Strong Recruiter standing:</span> a sustained record
                of bringing new members into SubFeeds.
              </li>
            </ul>
            <p>
              The <span className="font-medium">/subfeeds/new</span> page shows your progress toward
              each path. Ineligible members see the requirements instead of the creation form. A
              frozen standing or an admin-revoked role blocks the corresponding path — and your User
              Feed remains fully available in the meantime.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local Governance, Global Isolation</CardTitle>
            <CardDescription>
              Every SubFeed is its own editorial team. Local roles apply only inside that SubFeed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              The creator becomes the SubFeed owner. From the roster, the owner and local moderators
              can promote members into local roles and revoke them again.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {localRoleGuides.map((role) => (
                <div key={role.role} className="rounded-lg border p-4 space-y-1">
                  <h3 className="font-medium">{role.role}</h3>
                  <p className="text-muted-foreground">{role.description}</p>
                </div>
              ))}
            </div>
            <p>
              Local roles grant <span className="font-medium">no site-wide permissions</span>. A
              SubFeed moderator cannot moderate the Main Feed, quarantine content, freeze standing,
              or reach the admin panel. Site-level moderation remains with site admins, moderators,
              and editors.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SubFeeds Compete in the Main Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>Users can join or leave SubFeeds from SubFeed pages.</li>
              <li>
                Posting to a SubFeed requires a local publishing role — Uploader, Editor, Moderator,
                or Owner. Joining as a member only grants participation.
              </li>
              <li>
                SubFeed links and posts are ranked with the same ranking logic as the rest of the
                platform.
              </li>
              <li>
                Strong SubFeed content can rise into the Main Feed and carry its SubFeed origin
                badge, so readers can see where it came from.
              </li>
              <li>
                Successful community growth in a SubFeed feeds recruiter points back to the
                organiser.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Main Feed and Ranking</h2>

        <Card>
          <CardHeader>
            <CardTitle>What Enters the Main Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>The Home feed combines two sources of content:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Native Main Feed content</span> published directly by
                site admins, moderators, editors, and uploaders.
              </li>
              <li>
                <span className="font-medium">Promoted content</span> from SubFeeds and User Feeds
                that earns its way up.
              </li>
            </ul>
            <p>Promoted content must pass all safety checks and at least one promotion path:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>It is featured by an authorised member, or</li>
              <li>
                it clears the organic engagement gate: enough score, upvotes, and ranking strength,
                plus either discovery momentum or engagement velocity, or
              </li>
              <li>it receives a curated discovery boost from a member with discovery standing.</li>
            </ul>
            <p>
              Safety is authoritative: controversial, quarantined, soft-deleted, and removed items
              never promote, even if they are featured.
            </p>
            <p className="text-muted-foreground">
              The Home feed lists links. The same promotion and safety policy applies to posts
              wherever they surface.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editorial Priority</CardTitle>
            <CardDescription>
              Direct Main Feed publications get a short head start, then compete on the same terms
              as everyone else.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                When a site admin, moderator, editor, or uploader publishes directly to the Main
                Feed, the item receives a short editorial priority window.
              </li>
              <li>
                While the window is active, the item gets a ranking boost and an{' '}
                <span className="font-medium">Editorial Priority</span> badge on its card.
              </li>
              <li>
                When the window expires, the badge disappears and the boost is no longer applied the
                next time ranking is recalculated. From then on the item competes purely on
                community engagement.
              </li>
              <li>
                Priority is not a permanent privilege and does not bypass safety exclusions or
                quarantine.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Discovery Boost</CardTitle>
            <CardDescription>
              Members who have proven they can spot good content can help it reach the Main Feed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Site admins, moderators, and editors can always boost. Other members need a
                meaningful amount of decayed Discovery standing.
              </li>
              <li>
                A boost only works on published, non-controversial, non-quarantined, non-deleted
                SubFeed or User Feed content.
              </li>
              <li>
                The original booster or a site moderator/editor can roll a boost back. Site
                moderators and editors can also clear all promotion at once if needed.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Why Links Move Up or Down</CardTitle>
            <CardDescription>
              Ranking is recalculated as interactions arrive and as content ages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Major positive factors include:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Freshness (newer links get a stronger boost)</li>
              <li>Engagement velocity (interactions per hour)</li>
              <li>Unique commenters and trusted interactions</li>
              <li>Discovery momentum from click and discovery activity</li>
              <li>An active editorial priority window</li>
            </ul>
            <p>Major negative factors include:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Spam probability signals</li>
              <li>Ragebait probability signals</li>
              <li>Controversy (which also blocks Main Feed promotion)</li>
              <li>Age decay over time</li>
            </ul>
            <p>
              In practice, links change rank when people vote, comment, click through, discover
              them, or when the link simply gets older and its freshness advantage decays.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Safety & Admin Controls</h2>
        <Card>
          <CardHeader>
            <CardTitle>Self-Regulation With Emergency Rails</CardTitle>
            <CardDescription>
              The community drives standing and promotion. Admins and site moderators keep a small
              set of emergency controls for abuse and platform health.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Quarantine.</span> Site moderators and editors can
                quarantine a link or post. It is immediately removed from public reads, the Main
                Feed, and all promotion paths until released.
              </li>
              <li>
                <span className="font-medium">Promotion rollback.</span> Site moderators and editors
                can clear a featured flag, discovery boost, and editorial priority in one action,
                returning the item to normal organic ranking.
              </li>
              <li>
                <span className="font-medium">Standing freeze.</span> Admins can freeze a
                member&apos;s standing so it neither rises nor falls while an issue is investigated.
              </li>
              <li>
                <span className="font-medium">Role rollback.</span> Admins can revoke all
                automatically earned roles at once and optionally freeze standing to prevent
                immediate re-derivation. Revoked roles are not re-granted automatically.
              </li>
            </ul>
            <p className="text-muted-foreground">
              These are safety rails, not the normal way the platform is run. Day-to-day standing,
              roles, SubFeed access, and Main Feed promotion are decided by community activity.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
