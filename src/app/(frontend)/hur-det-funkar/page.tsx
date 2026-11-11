import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getDictionary } from '@/lib/dictionaries'
import {
  COLD_START_FLOOR,
  HYSTERESIS_DEMOTE_MARGIN,
  HYSTERESIS_PROMOTE_MARGIN,
  RECENCY_HALF_LIFE_DAYS,
  ROLE_RETENTION_FACTOR,
  TRUST_LEVEL_THRESHOLDS,
} from '@/lib/community/reputation'
import {
  DISCOVERY_BOOST_MIN_SCORE,
  MAIN_FEED_PROMOTION_THRESHOLD,
  PROMOTION_DISCOVERY_MOMENTUM_MIN,
  PROMOTION_ENGAGEMENT_VELOCITY_MIN,
} from '@/lib/community/promotion'
import {
  EDITORIAL_PRIORITY_BOOST,
  EDITORIAL_PRIORITY_DURATION_HOURS,
} from '@/lib/community/ranking'
import {
  EDITOR_CONTRIBUTION,
  EDITOR_CONTRIBUTION_SOLO,
  EDITOR_INTERACTION,
  SUBFEED_CANDIDACY_FACTOR,
  SUBFEED_STRONG_RECRUITER_THRESHOLD,
  UPLOADER_CONTRIBUTION,
  UPLOADER_CONTRIBUTION_SOLO,
  UPLOADER_DISCOVERY,
} from '@/lib/community/subfeedEligibility'

export const metadata: Metadata = {
  title: 'Hur V4 funkar',
}

/** Poängtrösklar som visas i delflödesporten, avrundade för läsbarhet. */
const candidateThreshold = (value: number): number => Math.round(value * SUBFEED_CANDIDACY_FACTOR)

const pointClassGuides = [
  {
    name: 'Interaktionspoäng',
    description:
      'Belönar dagligt deltagande, röstning, kommentarer, delning och andra communityhandlingar.',
    examples: 'Inloggningar, kommentarer, röster, delningar och andra positiva interaktioner.',
  },
  {
    name: 'Uppskattningspoäng',
    description:
      'Belönar innehåll som communityn gillar, kommenterar, delar och svarar positivt på.',
    examples: 'Uppröstade inlägg, uppskattade kommentarer och andra uppskattade bidrag.',
  },
  {
    name: 'Bidragspoäng',
    description: 'Belönar originalinnehåll i form av länkar, inlägg, media och artiklar.',
    examples: 'Inlägg, länkar, videor, bilder och artiklar som får verkligt engagemang.',
  },
  {
    name: 'Städpoäng',
    description:
      'Belönar rapporter och städarbete som hjälper till att ta bort spam och förbättra sajten.',
    examples: 'Godkända rapporter, modereringsvinster, stavfel, döda länkar och taggarbete.',
  },
  {
    name: 'Upptäcktspoäng',
    description:
      'Belönar att vara tidig med innehåll som senare blir populärt eller inflytelserikt.',
    examples:
      'Tidig upptäckt av stigande länkar, återuppväckta gamla guldkorn och genombrottsinlägg.',
  },
  {
    name: 'Värvningspoäng',
    description: 'Belönar att du tar nya medlemmar till ekosystemet och bygger aktiva communities.',
    examples: 'Tillväxt i delflöden och högkvalitativ medlemsvärvning.',
  },
  {
    name: 'Säkerhetspoäng',
    description: 'Belönar starkare kontosäkerhet och ansvarsfull säkerhetsrapportering.',
    examples: 'Verifierad e-post, säkert lösenord, 2FA och rapportering av säkerhetsproblem.',
  },
]

const roleGuides = [
  {
    role: 'Användare',
    description:
      'Standardroll med normal rättighet att posta, rösta, kommentera, spara bokmärken och rapportera.',
    howToAchieve: 'Tilldelas automatiskt vid registrering och är basrollen.',
  },
  {
    role: 'Uppladdare',
    description: 'Kan publicera länkar, bilder, video och annan media direkt i huvudflödet.',
    howToAchieve:
      'Härleds automatiskt från bidrags- och upptäcktssignaler när du når Recognized-nivå. Behålls så länge signalerna är starka och släpps tillbaka om de avtar.',
  },
  {
    role: 'Moderator',
    description: 'Kan granska rapporter, ta bort innehåll och hantera modereringsflöden.',
    howToAchieve:
      'Härleds automatiskt från höga städ- och säkerhetssignaler medan aktiviteten är aktuell. Behålls med marginal och släpps sedan om signalerna faller.',
  },
  {
    role: 'Redaktör',
    description: 'Kan publicera redaktionellt innehåll och meddelanden direkt i huvudflödet.',
    howToAchieve:
      'Härleds automatiskt från starka bidrags- och interaktionssignaler på Trusted-nivå eller högre. Behålls så länge du är aktiv och bidrar.',
  },
  {
    role: 'Städare',
    description:
      'Kan hjälpa till att hålla plattformen ren genom att förtjäna förtroende via verifierat städarbete och rapporter.',
    howToAchieve:
      'Härleds automatiskt från städsignaler och betrodda aktivitetsmönster; behålls så länge städarbetet fortsätter.',
  },
  {
    role: 'Värvare',
    description:
      'Uppmärksammar medlemmar som hjälper till att växa communities och delflöden genom att ta in nya medlemmar.',
    howToAchieve:
      'Härleds automatiskt från värvningssignaler och uthålligt bidragsbeteende; behålls så länge tillväxten fortsätter.',
  },
  {
    role: 'Admin',
    description:
      'Operativa och akuta säkerhetsbehörigheter, inklusive frysning av anseende och återkallande av roller.',
    howToAchieve:
      'Tilldelas manuellt av en befintlig admin; härleds inte automatiskt. Admin är den enda rollen som aldrig löper ut.',
  },
]

const localRoleGuides = [
  {
    role: 'Ägare',
    description: 'Medlemmen som skapade delflödet. Har alltid full lokal kontroll över delflödet.',
  },
  {
    role: 'Moderator',
    description: 'Kan moderera innehåll i delflödet och hantera den lokala medlemslistan.',
  },
  {
    role: 'Redaktör',
    description: 'Kan kurationera innehåll i delflödet, men inte ändra medlemslistan.',
  },
  {
    role: 'Uppladdare',
    description: 'Kan publicera länkar och inlägg i delflödet.',
  },
  {
    role: 'Medlem',
    description: 'Kan skicka in innehåll och delta i delflödets community.',
  },
]

export default async function HurDetFunkarPage() {
  const { lang } = await getDictionary()

  if (lang !== 'sv') {
    redirect('/how-it-works')
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold">Hur V4 funkar</h1>
        <p className="text-muted-foreground max-w-3xl">
          V4 är byggt för att vara dynamiskt och självreglerande. Anseende, roller, tillgång till
          delflöden och lyft till huvudflödet styrs av vad communityn faktiskt gör — inte av en fast
          hierarki eller ett fåtal manuella beslut. Den här sidan förklarar mekaniken bakom.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Poängklasser</h2>
        <Card>
          <CardHeader>
            <CardTitle>Hur aktivitet blir anseende</CardTitle>
            <CardDescription>
              Systemet följer flera poängklasser och räknar ihop dem till ett dolt anseende och en
              offentlig förtroendeetikett.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Det offentliga anseendet är medvetet förenklat. Internt är ditt anseende en viktad
              blandning av upptäckt, bidrag, uppskattning, interaktion, städning, värvning, tidigare
              bidrag och säkerhet. Varje poängklass tjänas in genom aktivitet — inget tilldelas för
              hand.
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
        <h2 className="text-2xl font-semibold">Anseende, nedtrappning och förtroendenivåer</h2>

        <Card>
          <CardHeader>
            <CardTitle>Ditt anseende lever</CardTitle>
            <CardDescription>
              Förtroende är inte en engångsetikett. Det stiger med bidrag och svalnar när du är
              tyst.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Dolt anseende räknas fram från dina poängklasser med dessa vikter:
              <br />
              <span className="font-mono">
                upptäckt x 1.6 + bidrag x 1.35 + uppskattning x 1.25 + interaktion x 0.85 + städning
                x 0.55 + värvning x 0.9 + tidigareBidrag x 0.35 + säkerhet x 0.4
              </span>
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Nedtrappning över tid.</span> Ditt effektiva anseende
                halveras för varje {RECENCY_HALF_LIFE_DAYS} dagars inaktivitet. När du kommer
                tillbaka och bidrar igen stiger det.
              </li>
              <li>
                <span className="font-medium">Golv för nya konton.</span> Alla medlemmar med genuin
                aktivitet de senaste 30 dagarna behåller minst {COLD_START_FLOOR} effektivt anseende
                — tillräckligt för att etablera en basnivå utan att nya konton kan farma högre
                nivåer.
              </li>
              <li>
                <span className="font-medium">Ingen permanent platå.</span> Eftersom anseendet
                trappas ner kan förtroendenivåer röra sig både upp och ner. Communityns samlade
                aktivitet håller hela systemet i rörelse.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trösklar för förtroendenivåer</CardTitle>
            <CardDescription>
              Ditt effektiva anseende mappas till en av dessa offentliga förtroendeetiketter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Nivå</th>
                    <th className="text-left py-2">Minsta effektiva anseende</th>
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
            <p className="text-muted-foreground">
              Etiketterna är desamma som visas i gränssnittet. Det är ditt effektiva anseende efter
              nedtrappning som avgör din nivå i dag — inte en permanent poäng.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stabilitet utan stagnering</CardTitle>
            <CardDescription>
              Hysteres hindrar medlemmar från att flimra mellan nivåer vid en gräns, samtidigt som
              verklig rörelse fortfarande är möjlig.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Uppflyttning till en högre förtroendenivå kräver att du passerar tröskeln med{' '}
                {HYSTERESIS_PROMOTE_MARGIN} poäng.
              </li>
              <li>
                Nedflyttning sker först när ditt anseende faller {HYSTERESIS_DEMOTE_MARGIN} poäng
                under din nuvarande nivås tröskel.
              </li>
              <li>
                Intjänade roller har egen marginal: en roll behålls så länge du har minst{' '}
                {Math.round(ROLE_RETENTION_FACTOR * 100)} % av dess uppflyttningskrav, med en
                förtroendenivås lättnad.
              </li>
              <li>
                Om en rolls signaler faller under marginalen släpps rollen automatiskt — den
                återkallas inte permanent.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Sajtroller</h2>
        <div className="grid gap-4">
          {roleGuides.map((role) => (
            <Card key={role.role}>
              <CardHeader>
                <CardTitle>{role.role}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{role.description}</p>
                <p>
                  <span className="font-medium">Så får du rollen:</span> {role.howToAchieve}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Automatisk progression</h2>
        <Card>
          <CardContent className="space-y-2 py-6 text-sm">
            <p>
              De flesta högre roller tilldelas inte manuellt. De härleds från dina nuvarande
              poängklasser, ditt effektiva anseende och din senaste aktivitet.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Inaktivitet minskar ditt effektiva anseende och kan leda till att du förlorar
                intjänade roller.
              </li>
              <li>
                Roller behålls med en marginal innan de släpps, så korta lugna perioder kostar dig
                inte din ställning.
              </li>
              <li>
                Admin är undantaget och måste fortfarande tilldelas manuellt; det löper aldrig ut
                automatiskt.
              </li>
              <li>
                Den offentliga profilen visar din förtroendeetikett och intjänade roller i stället
                för den råa interna poängen.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Delflöden</h2>

        <Card>
          <CardHeader>
            <CardTitle>Delflöden tjänas in, de är inte öppna</CardTitle>
            <CardDescription>
              Delflöden konkurrerar direkt med huvudflödet, så att skapa ett kräver bevisat anseende
              i communityn.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Varje konto har redan ett användarflöde. Ett delflöde är något annat: en separat
              redaktionell yta som kan konkurrera om uppmärksamhet i huvudflödet. För att hålla det
              exklusivt måste du uppfylla <span className="font-medium">minst en</span> av dessa
              vägar:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Uppladdarkandidatur:</span>{' '}
                {candidateThreshold(UPLOADER_CONTRIBUTION_SOLO)}+ Bidragspoäng, eller{' '}
                {candidateThreshold(UPLOADER_CONTRIBUTION)}+ Bidrag och{' '}
                {candidateThreshold(UPLOADER_DISCOVERY)}+ Upptäcktspoäng med Recognized-nivå.
              </li>
              <li>
                <span className="font-medium">Redaktörskandidatur:</span>{' '}
                {candidateThreshold(EDITOR_CONTRIBUTION_SOLO)}+ Bidragspoäng, eller{' '}
                {candidateThreshold(EDITOR_CONTRIBUTION)}+ Bidrag och{' '}
                {candidateThreshold(EDITOR_INTERACTION)}+ Interaktionspoäng med Trusted-nivå.
              </li>
              <li>
                <span className="font-medium">Stark värvarställning:</span>{' '}
                {SUBFEED_STRONG_RECRUITER_THRESHOLD}+ Värvningspoäng.
              </li>
            </ul>
            <p>
              Sidan <span className="font-medium">/subfeeds/new</span> visar din progress mot varje
              väg. Medlemmar som inte är behöriga ser kraven i stället för formuläret. Ett fryst
              anseende eller en roll som återkallats av admin blockerar motsvarande väg — och ditt
              användarflöde är fortfarande fullt tillgängligt under tiden.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lokal styrning, global isolering</CardTitle>
            <CardDescription>
              Varje delflöde är sitt eget redaktionella team. Lokala roller gäller bara inom det
              delflödet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Skaparen blir ägare av delflödet. Från medlemslistan kan ägaren och lokala moderatorer
              befordra medlemmar till lokala roller och återkalla dem igen.
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
              Lokala roller ger{' '}
              <span className="font-medium">inga webbplatsövergripande behörigheter</span>. En
              moderator i ett delflöde kan inte moderera huvudflödet, karantänsätta innehåll, frysa
              anseende eller nå adminpanelen. Moderering på sajtnivå ligger kvar hos sajtens admins,
              moderatorer och redaktörer.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delflöden konkurrerar i huvudflödet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>Användare kan gå med i eller lämna delflöden från delflödets sidor.</li>
              <li>
                Att posta i ett delflöde kräver medlemskap eller en lokal roll som uppladdare,
                redaktör, moderator eller ägare.
              </li>
              <li>
                Länkar och inlägg i delflöden rankas med samma rankningslogik som resten av
                plattformen.
              </li>
              <li>
                Starkt innehåll från delflöden kan klättra till huvudflödet och bär då en etikett
                som visar var det kommer ifrån.
              </li>
              <li>
                Framgångsrik tillväxt i ett delflöde ger värvningspoäng tillbaka till organisatören.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Huvudflödet och rankning</h2>

        <Card>
          <CardHeader>
            <CardTitle>Vad som kommer in i huvudflödet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Hemflödet kombinerar två källor:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Inbyggt huvudflödesinnehåll</span> som publiceras
                direkt av sajtens admins, moderatorer, redaktörer och uppladdare.
              </li>
              <li>
                <span className="font-medium">Lyft innehåll</span> från delflöden och användarflöden
                som tar sig upp.
              </li>
            </ul>
            <p>Lyft innehåll måste klara alla säkerhetskontroller och minst en lyftväg:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Det är utvalt (featured) av en behörig medlem, eller</li>
              <li>
                det klarar den organiska engagemangströskeln: poäng{' '}
                {MAIN_FEED_PROMOTION_THRESHOLD.score}+, uppröster{' '}
                {MAIN_FEED_PROMOTION_THRESHOLD.upvotes}+, rankningspoäng{' '}
                {MAIN_FEED_PROMOTION_THRESHOLD.rankingScore}+, och antingen upptäcktsmomentum{' '}
                {PROMOTION_DISCOVERY_MOMENTUM_MIN}+ eller engagemangshastighet{' '}
                {PROMOTION_ENGAGEMENT_VELOCITY_MIN}+, eller
              </li>
              <li>det får en kurerad upptäcktsboost från en medlem med upptäcktsanseende.</li>
            </ul>
            <p>
              Säkerheten är avgörande: kontroversiellt, karantänsatt, mjukraderat och borttaget
              innehåll lyfts aldrig, även om det är utvalt.
            </p>
            <p className="text-muted-foreground">
              Hemflödet listar länkar. Samma lyft- och säkerhetspolicy gäller för inlägg där de
              visas.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Redaktionell prioritet</CardTitle>
            <CardDescription>
              Direkta publiceringar i huvudflödet får ett kort försprång och konkurrerar sedan på
              samma villkor som alla andra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                När en sajtadmin, moderator, redaktör eller uppladdare publicerar direkt i
                huvudflödet får innehållet ett redaktionellt prioritetsfönster på{' '}
                {EDITORIAL_PRIORITY_DURATION_HOURS} timmar.
              </li>
              <li>
                Medan fönstret är aktivt får innehållet en rankningsboost på +
                {EDITORIAL_PRIORITY_BOOST} och en etikett med texten{' '}
                <span className="font-medium">Editorial Priority</span> på kortet.
              </li>
              <li>
                När fönstret löper ut försvinner etiketten och boosten tillämpas inte nästa gång
                rankningen räknas om. Därefter konkurrerar innehållet enbart på communityns
                engagemang.
              </li>
              <li>
                Prioritet är inte en permanent förmån och kringgår inte säkerhetsundantag eller
                karantän.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upptäcktsboost</CardTitle>
            <CardDescription>
              Medlemmar som har visat att de kan hitta bra innehåll kan hjälpa det att nå
              huvudflödet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Sajtens admins, moderatorer och redaktörer kan alltid boosta. Andra medlemmar
                behöver {DISCOVERY_BOOST_MIN_SCORE}+ nedtrappat upptäcktsanseende.
              </li>
              <li>
                En boost fungerar bara på publicerat, icke-kontroversiellt, icke-karantänsatt och
                icke-raderat innehåll i delflöden eller användarflöden.
              </li>
              <li>
                Den som boostade ursprungligen eller en sajtmoderator/redaktör kan rulla tillbaka
                boosten. Sajtmoderatorer och redaktörer kan också rensa all lyftning på en gång vid
                behov.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Varför länkar flyttas upp eller ner</CardTitle>
            <CardDescription>
              Rankningen räknas om när interaktioner kommer in och när innehåll åldras.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Större positiva faktorer:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Färskhet (nyare länkar får starkare boost)</li>
              <li>Engagemangshastighet (interaktioner per timme)</li>
              <li>Unika kommentatorer och betrodda interaktioner</li>
              <li>Upptäcktsmomentum från klick- och upptäcktsaktivitet</li>
              <li>Ett aktivt fönster för redaktionell prioritet</li>
            </ul>
            <p>Större negativa faktorer:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Spamsannolikhet</li>
              <li>Ragebait-sannolikhet</li>
              <li>Kontrovers (blockerar också lyft till huvudflödet)</li>
              <li>Åldersnedtrappning över tid</li>
            </ul>
            <p>
              I praktiken ändras länkars rank när folk röstar, kommenterar, klickar, upptäcker dem,
              eller när länken helt enkelt blir äldre och dess färskhetsfördel avtar.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Säkerhet och adminverktyg</h2>
        <Card>
          <CardHeader>
            <CardTitle>Självreglering med akuta skyddsräcken</CardTitle>
            <CardDescription>
              Communityn driver anseende och lyft. Admins och sajtmoderatorer har en liten
              uppsättning akuta verktyg för missbruk och plattformshälsa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium">Karantän.</span> Sajtmoderatorer och redaktörer kan
                karantänsätta en länk eller ett inlägg. Det tas omedelbart bort från offentliga
                läsningar, huvudflödet och alla lyftvägar tills det släpps.
              </li>
              <li>
                <span className="font-medium">Återställ lyft.</span> Sajtmoderatorer och redaktörer
                kan rensa utvald-status, upptäcktsboost och redaktionell prioritet i en åtgärd, så
                att innehållet återgår till normal organisk rankning.
              </li>
              <li>
                <span className="font-medium">Frys anseende.</span> Admins kan frysa en medlems
                anseende så att det varken stiger eller faller medan ett ärende utreds.
              </li>
              <li>
                <span className="font-medium">Återkalla roller.</span> Admins kan återkalla alla
                automatiskt intjänade roller på en gång och valfritt frysa anseendet för att
                förhindra omedelbar återhärledning. Återkallade roller tilldelas inte automatiskt
                igen.
              </li>
            </ul>
            <p className="text-muted-foreground">
              Det här är skyddsräcken, inte det normala sättet att driva plattformen. Daglig
              styrning av anseende, roller, delflödesåtkomst och lyft till huvudflödet avgörs av
              communityaktivitet.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
