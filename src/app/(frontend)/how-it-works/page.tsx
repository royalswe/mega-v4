import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TRUST_LEVEL_THRESHOLDS } from '@/lib/community/reputation'

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
    examples: 'Subfeed growth and high-quality member acquisition.',
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
    description: 'Can publish links, images, video, and other media directly into the main feed.',
    howToAchieve:
      'Derived automatically from contribution and discovery signals when activity stays strong.',
  },
  {
    role: 'Moderator',
    description: 'Can review reports, remove content, and manage moderation workflows.',
    howToAchieve:
      'Derived automatically from high cleaning, security, and trust signals while activity remains recent.',
  },
  {
    role: 'Editor',
    description: 'Can publish editorial content and announcements into the main feed.',
    howToAchieve:
      'Derived automatically from strong contribution and interaction signals while the account stays active.',
  },
  {
    role: 'Cleaner',
    description:
      'Can help keep the platform clean by earning trust through verified cleanup and reports.',
    howToAchieve: 'Derived automatically from cleaning signals and trusted activity patterns.',
  },
  {
    role: 'Recruiter',
    description:
      'Recognizes users who help grow communities and subfeeds by bringing in new members.',
    howToAchieve:
      'Derived automatically from recruiter signals and sustained contribution behavior.',
  },
  {
    role: 'Admin',
    description:
      'Full administrative permissions, including role management and user administration.',
    howToAchieve: 'Granted manually by an existing Admin; this is not auto-derived.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold">How V4 Works</h1>
        <p className="text-muted-foreground max-w-3xl">
          This page explains how point classes, trust levels, roles, main feed ranking, and subfeeds
          work in the current platform logic.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Point Classes</h2>
        <Card>
          <CardHeader>
            <CardTitle>How Points Turn Into Reputation</CardTitle>
            <CardDescription>
              The system tracks multiple point classes and rolls them up into hidden reputation and
              a public trust label.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Public-facing reputation is intentionally simplified. The internal score is a weighted
              blend of discovery, contribution, likability, interaction, cleaning, recruiter, legacy
              contribution, and security signals.
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
        <h2 className="text-2xl font-semibold">Trust Levels</h2>
        <Card>
          <CardHeader>
            <CardTitle>How Trust Level Is Calculated</CardTitle>
            <CardDescription>
              Trust level is derived from hidden reputation, which is a weighted sum of point class
              signals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Hidden reputation is calculated from these signals:
              <br />
              <span className="font-mono">
                discovery x 1.6 + contribution x 1.35 + likability x 1.25 + interaction x 0.85 +
                cleaning x 0.55 + recruiter x 0.9 + legacyContribution x 0.35 + security x 0.4
              </span>
            </p>
            <p>
              The score is then mapped to a trust level threshold. Higher trust generally comes from
              sustained quality contributions, useful interactions, successful cleanup, and healthy
              account behavior over time.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trust Level Thresholds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Level</th>
                    <th className="text-left py-2">Minimum Hidden Reputation</th>
                  </tr>
                </thead>
                <tbody>
                  {TRUST_LEVEL_THRESHOLDS.map((level) => (
                    <tr key={level.value} className="border-b last:border-0">
                      <td className="py-2 pr-4">{level.label}</td>
                      <td className="py-2">{level.min}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Roles</h2>
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
              point classes, trust level, and recent activity.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Activity decays into the user role if you go inactive for too long.</li>
              <li>Admin is the exception and must still be granted manually.</li>
              <li>
                The public label shows your trust state instead of exposing raw internal score.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Main Feed and Ranking</h2>
        <Card>
          <CardHeader>
            <CardTitle>How Links Enter the Main Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>The home feed shows links filtered by:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Published status</li>
              <li>Not removed by moderation</li>
              <li>Your NSFW preference (if NSFW is off, NSFW links are filtered out)</li>
            </ul>
            <p>
              Links are ordered by descending ranking score, and promoted subfeed content can mix
              into the main feed when it passes the promotion threshold.
            </p>
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
              <li>Discovery momentum from click activity</li>
            </ul>
            <p>Major negative factors include:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Spam probability signals</li>
              <li>Ragebait probability signals</li>
              <li>Age decay over time</li>
            </ul>
            <p>
              In practice, links change rank when people vote, comment, click through, or when the
              link simply gets older and its freshness advantage decays.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">SubFeeds</h2>
        <Card>
          <CardHeader>
            <CardTitle>How SubFeeds Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>Any logged-in user can create a subfeed.</li>
              <li>The creator is automatically added as both moderator and member.</li>
              <li>Users can join or leave subfeeds from subfeed pages.</li>
              <li>
                Posting to a subfeed requires membership (or moderator/editor/admin privileges).
              </li>
              <li>
                Inside each subfeed, links and posts are ranked by the same ranking score logic as
                the broader feeds.
              </li>
              <li>
                Successful community growth in a subfeed can feed recruiter points back to the
                organizer.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
