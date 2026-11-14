import Link from 'next/link'

import type { SubfeedEligibility } from '@/lib/community/subfeedEligibility'
import type { AppDictionary } from '@/lib/dictionaries'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SubfeedEligibilityGateProps {
  eligibility: SubfeedEligibility
  dict: AppDictionary
  userFeedHref: string
}

export function SubfeedEligibilityGate({
  eligibility,
  dict,
  userFeedHref,
}: SubfeedEligibilityGateProps) {
  const copy = dict.subfeeds?.eligibilityGate
  const title = copy?.title || 'SubFeeds are earned'
  const intro =
    copy?.intro ||
    'SubFeeds compete with the Main Feed, so creators must have earned community standing first.'
  const requirementsTitle = copy?.requirementsTitle || 'Your path to creating a SubFeed'

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {eligibility.locked ? (
          <Alert>
            <AlertTitle>{copy?.lockedTitle || 'Standing frozen'}</AlertTitle>
            <AlertDescription>
              {copy?.lockedMessage ||
                'Your community standing is currently frozen, so you cannot create a SubFeed right now.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <h3 className="text-sm font-semibold">{requirementsTitle}</h3>
            <ul className="space-y-4">
              {eligibility.progress.map((item) => {
                const percent = Math.round(item.current * 100)

                return (
                  <li key={item.requirement} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.met
                          ? copy?.earned || 'Earned'
                          : (copy?.progressPercent || '{percent}% complete').replace(
                              '{percent}',
                              String(percent),
                            )}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={item.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.met
                            ? 'bg-emerald-500'
                            : 'bg-linear-to-r from-sky-400 to-emerald-400'
                        }`}
                        style={{ width: `${Math.max(item.met ? 100 : percent, 2)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm">
            {copy?.userFeedNote ||
              'You can still publish and manage content on your own User Feed right now.'}
          </p>
          <Button asChild variant="outline" className="mt-3">
            <Link href={userFeedHref}>{copy?.userFeedLink || 'Go to your User Feed'}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
