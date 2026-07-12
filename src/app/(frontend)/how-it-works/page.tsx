import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TRUST_LEVEL_THRESHOLDS } from '@/lib/community/reputation'

const roleGuides = [
  {
    role: 'User',
    description:
      'Default account role with normal posting, voting, commenting, and bookmarking access.',
    howToAchieve: 'Created automatically when you sign up.',
  },
  {
    role: 'Uploader',
    description: 'Intended for users trusted to contribute media-focused content and uploads.',
    howToAchieve: 'Granted manually by an Admin in the user roles settings.',
  },
  {
    role: 'Moderator',
    description:
      'Can moderate content workflows and is treated as trusted in community scoring and moderation logic.',
    howToAchieve: 'Granted manually by an Admin based on trust, consistency, and behavior.',
  },
  {
    role: 'Editor',
    description:
      'Editorial role with elevated oversight, included in community moderation privileges.',
    howToAchieve: 'Granted manually by an Admin.',
  },
  {
    role: 'Admin',
    description:
      'Full administrative permissions, including role management and user administration.',
    howToAchieve: 'Granted manually by an existing Admin.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold">How MEGA V4 Works</h1>
        <p className="text-muted-foreground max-w-3xl">
          This page explains how trust levels, roles, main feed ranking, and subfeeds work in the
          current platform logic.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Trust Levels</h2>
        <Card>
          <CardHeader>
            <CardTitle>How Trust Level Is Calculated</CardTitle>
            <CardDescription>
              Trust level is derived from hidden reputation, which is a weighted sum of score
              signals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Hidden reputation is calculated from these signals:
              <br />
              <span className="font-mono">
                discovery x 1.6 + contribution x 1.35 + interaction x 0.85 + moderation x 0.55 +
                legacyContribution x 0.35 + security x 0.4
              </span>
            </p>
            <p>
              The score is then mapped to a trust level threshold. Higher trust generally comes from
              sustained quality contributions, useful interactions, and healthy account behavior
              over time.
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
            <p>Links are ordered by descending ranking score.</p>
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
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
