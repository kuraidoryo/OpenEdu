import type { DayOfWeek, DutyInfo, Exam, Grade, Lesson, Message, MessageFolder } from '@/models/types';
import type { IVulcanDataProvider, SessionInfo } from './IVulcanProvider';

// ───────────────────────────── Helpers ─────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simulated network latency (ms). */
const latency = () => sleep(250 + Math.random() * 450);

const daysAgo = (days: number, hour = 10, minute = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

/**
 * Returns an ISO date for the given school day (`1..5`) in the current week.
 * If `preferUpcoming` is true and that weekday already passed this week,
 * returns the same weekday next week so there's always an upcoming exam.
 */
const dateForWeekday = (dayOfWeek: DayOfWeek, preferUpcoming = false): string => {
  const now = new Date();
  const monday = new Date(now);
  const offsetFromMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offsetFromMonday);
  monday.setHours(12, 0, 0, 0);

  const target = new Date(monday);
  target.setDate(monday.getDate() + (dayOfWeek - 1));
  if (preferUpcoming) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (target.getTime() < todayStart) {
      target.setDate(target.getDate() + 7);
    }
  }
  return target.toISOString();
};

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ───────────────────────────── Static data ─────────────────────────────

export const MOCK_STUDENT = {
  userName: 'Jan Kowalski',
  className: '2B',
  schoolName: 'XIV Liceum Ogólnokształcące im. Stanisława Staszica w Warszawie',
} as const;

const TEACHERS = {
  polski: 'mgr Anna Wiśniewska',
  matematyka: 'mgr Tomasz Zieliński',
  angielski: 'mgr Katarzyna Lewandowska',
  niemiecki: 'mgr Ewa Schmidt',
  historia: 'dr Piotr Wójcik',
  biologia: 'mgr Magdalena Kamińska',
  chemia: 'mgr Robert Dąbrowski',
  fizyka: 'mgr inż. Marek Kozłowski',
  geografia: 'mgr Agnieszka Jankowska',
  informatyka: 'mgr Paweł Mazur',
  wf: 'mgr Krzysztof Krawczyk',
  religia: 'ks. Andrzej Nowicki',
  wychowawca: 'mgr Tomasz Zieliński',
  dyrektor: 'mgr Barbara Pawłowska (Dyrektor)',
  pedagog: 'mgr Joanna Grabowska (Pedagog szkolny)',
  sekretariat: 'Sekretariat szkoły',
} as const;

const SUBJECTS: Record<string, { name: string; teacher: string; room: string }> = {
  pol: { name: 'Język polski', teacher: TEACHERS.polski, room: '12' },
  mat: { name: 'Matematyka', teacher: TEACHERS.matematyka, room: '24' },
  ang: { name: 'Język angielski', teacher: TEACHERS.angielski, room: '31' },
  nie: { name: 'Język niemiecki', teacher: TEACHERS.niemiecki, room: '33' },
  his: { name: 'Historia', teacher: TEACHERS.historia, room: '15' },
  bio: { name: 'Biologia', teacher: TEACHERS.biologia, room: '41' },
  che: { name: 'Chemia', teacher: TEACHERS.chemia, room: '42' },
  fiz: { name: 'Fizyka', teacher: TEACHERS.fizyka, room: '43' },
  geo: { name: 'Geografia', teacher: TEACHERS.geografia, room: '18' },
  inf: { name: 'Informatyka', teacher: TEACHERS.informatyka, room: '205' },
  wf: { name: 'Wychowanie fizyczne', teacher: TEACHERS.wf, room: 'Sala gim.' },
  rel: { name: 'Religia', teacher: TEACHERS.religia, room: '9' },
  gw: { name: 'Godzina wychowawcza', teacher: TEACHERS.wychowawca, room: '24' },
};

/** Bell schedule (lesson number → start/end). */
export const BELL_SCHEDULE: ReadonlyArray<{ number: number; start: string; end: string }> = [
  { number: 1, start: '08:00', end: '08:45' },
  { number: 2, start: '08:55', end: '09:40' },
  { number: 3, start: '09:50', end: '10:35' },
  { number: 4, start: '10:50', end: '11:35' },
  { number: 5, start: '11:45', end: '12:30' },
  { number: 6, start: '12:40', end: '13:25' },
  { number: 7, start: '13:35', end: '14:20' },
  { number: 8, start: '14:30', end: '15:15' },
];

/** Weekly plan: day → list of subject keys (in lesson order, starting at lesson 1). */
const WEEK_PLAN: Record<1 | 2 | 3 | 4 | 5, string[]> = {
  1: ['gw', 'pol', 'pol', 'mat', 'ang', 'his', 'wf'],
  2: ['mat', 'fiz', 'che', 'bio', 'nie', 'inf', 'inf'],
  3: ['ang', 'pol', 'mat', 'mat', 'geo', 'rel', 'wf'],
  4: ['his', 'bio', 'nie', 'pol', 'fiz', 'che', 'ang', 'rel'],
  5: ['mat', 'ang', 'geo', 'pol', 'wf', 'inf'],
};

function buildTimetable(): Lesson[] {
  const lessons: Lesson[] = [];
  (Object.keys(WEEK_PLAN) as unknown as Array<keyof typeof WEEK_PLAN>).forEach((dayKey) => {
    const day = Number(dayKey) as 1 | 2 | 3 | 4 | 5;
    WEEK_PLAN[day].forEach((subjKey, idx) => {
      const subj = SUBJECTS[subjKey];
      const bell = BELL_SCHEDULE[idx];
      lessons.push({
        id: `mock-lesson-${day}-${bell.number}`,
        dayOfWeek: day as DayOfWeek,
        lessonNumber: bell.number,
        startTime: bell.start,
        endTime: bell.end,
        subject: subj.name,
        teacher: subj.teacher,
        room: subj.room,
      });
    });
  });

  // A few realistic changes.
  const setChange = (id: string, change: Lesson['changeInfo'], patch: Partial<Lesson> = {}) => {
    const l = lessons.find((x) => x.id === id);
    if (l) Object.assign(l, patch, { changeInfo: change });
  };
  setChange('mock-lesson-2-3', {
    type: 'substitution',
    description: 'Zastępstwo za mgr Roberta Dąbrowskiego',
    substituteTeacher: TEACHERS.biologia,
  }, { teacher: TEACHERS.biologia });
  setChange('mock-lesson-3-6', {
    type: 'cancelled',
    description: 'Lekcja odwołana – rekolekcje szkolne',
  });
  setChange('mock-lesson-4-5', {
    type: 'room-change',
    description: 'Zmiana sali: pracownia fizyczna niedostępna',
    newRoom: '27',
  }, { room: '27' });
  setChange('mock-lesson-5-6', {
    type: 'cancelled',
    description: 'Uczniowie zwolnieni – wycieczka do Centrum Nauki Kopernik',
  });

  return lessons;
}

function buildExams(): Exam[] {
  return [
    {
      id: 'mock-exam-1',
      subject: SUBJECTS.fiz.name,
      type: 'Kartkówka',
      description: 'Druga zasada dynamiki Newtona i siła tarcia – zadania obliczeniowe',
      date: dateForWeekday(2, true),
      dayOfWeek: 2,
      teacher: SUBJECTS.fiz.teacher,
    },
    {
      id: 'mock-exam-2',
      subject: SUBJECTS.mat.name,
      type: 'Sprawdzian',
      description: 'Ciągi arytmetyczne i geometryczne – wzory, suma n początkowych wyrazów i zadania tekstowe',
      date: dateForWeekday(3, true),
      dayOfWeek: 3,
      teacher: SUBJECTS.mat.teacher,
    },
    {
      id: 'mock-exam-3',
      subject: SUBJECTS.bio.name,
      type: 'Sprawdzian',
      description: 'Genetyka klasyczna i molekularna: prawa Mendla, replikacja DNA oraz kod genetyczny',
      date: dateForWeekday(4, true),
      dayOfWeek: 4,
      teacher: SUBJECTS.bio.teacher,
    },
    {
      id: 'mock-exam-4',
      subject: SUBJECTS.ang.name,
      type: 'Kartkówka',
      description: 'Unit 4: Conditionals (0, I, II) oraz słownictwo z rozdziału Work & Career',
      date: dateForWeekday(5, true),
      dayOfWeek: 5,
      teacher: SUBJECTS.ang.teacher,
    },
  ];
}

function buildGrades(): Grade[] {
  type Seed = [subjKey: string, value: string, weight: number, category: string, description: string, daysBack: number];
  const seeds: Seed[] = [
    ['pol', '4', 3, 'Sprawdzian', 'Romantyzm – sprawdzian', 40],
    ['pol', '5', 1, 'Odpowiedź ustna', 'Dziady cz. III', 30],
    ['pol', '4+', 2, 'Kartkówka', 'Środki stylistyczne', 21],
    ['pol', '3', 3, 'Sprawdzian', 'Wypracowanie – Lalka', 9],
    ['pol', '+', 0, 'Aktywność', 'Aktywność na lekcji', 3],
    ['mat', '3+', 3, 'Sprawdzian', 'Funkcja kwadratowa', 38],
    ['mat', '4', 2, 'Kartkówka', 'Postać kanoniczna', 25],
    ['mat', '2', 2, 'Kartkówka', 'Nierówności kwadratowe', 14],
    ['mat', '5', 1, 'Praca domowa', 'Zadania z ciągów', 6],
    ['mat', '4-', 3, 'Sprawdzian', 'Ciągi arytmetyczne', 2],
    ['ang', '5', 3, 'Sprawdzian', 'Unit 3 – Test', 35],
    ['ang', '6', 1, 'Projekt', 'Prezentacja: My dream job', 20],
    ['ang', '5-', 2, 'Kartkówka', 'Vocabulary – Unit 4', 8],
    ['nie', '3', 2, 'Kartkówka', 'Perfekt – czasowniki', 27],
    ['nie', '4', 3, 'Sprawdzian', 'Kapitel 2', 12],
    ['his', '4', 3, 'Sprawdzian', 'Powstanie listopadowe', 33],
    ['his', '5', 1, 'Odpowiedź ustna', 'Kongres wiedeński', 17],
    ['his', 'np', 0, 'Inne', 'Nieprzygotowanie', 4],
    ['bio', '4+', 3, 'Sprawdzian', 'Genetyka klasyczna', 29],
    ['bio', '5', 1, 'Praca domowa', 'Krzyżówka genetyczna', 11],
    ['che', '3', 3, 'Sprawdzian', 'Reakcje redoks', 26],
    ['che', '4', 2, 'Kartkówka', 'Stężenia roztworów', 7],
    ['fiz', '2+', 3, 'Sprawdzian', 'Dynamika', 31],
    ['fiz', '4', 1, 'Aktywność', 'Doświadczenie – wahadło', 15],
    ['geo', '5', 2, 'Kartkówka', 'Mapa polityczna Europy', 19],
    ['geo', '4', 3, 'Sprawdzian', 'Litosfera', 5],
    ['inf', '6', 2, 'Projekt', 'Strona WWW w HTML/CSS', 22],
    ['inf', '5', 1, 'Praca domowa', 'Algorytmy sortowania', 10],
    ['wf', '5', 1, 'Inne', 'Gry zespołowe – siatkówka', 16],
    ['wf', '6', 1, 'Inne', 'Bieg na 1000 m', 1],
    ['rel', '5', 1, 'Odpowiedź ustna', 'Przypowieści', 24],
  ];

  return seeds.map(([subjKey, value, weight, category, description, daysBack], i) => ({
    id: `mock-grade-${i + 1}`,
    subject: SUBJECTS[subjKey].name,
    value,
    weight,
    category,
    description,
    date: daysAgo(daysBack, 9 + (i % 6)),
    teacher: SUBJECTS[subjKey].teacher,
  }));
}

function buildMessages(): Message[] {
  return [
    {
      id: 'mock-msg-1',
      sender: TEACHERS.wychowawca,
      subject: 'Zebranie z rodzicami – 26 listopada',
      content:
        'Szanowni Państwo,\n\nuprzejmie informuję, że zebranie z rodzicami uczniów klasy 2B odbędzie się we wtorek 26 listopada o godz. 17:30 w sali nr 24.\n\nTematy spotkania:\n1. Wyniki nauczania w pierwszym okresie.\n2. Organizacja wycieczki klasowej.\n3. Sprawy bieżące.\n\nObecność obowiązkowa.\n\nZ wyrazami szacunku\nTomasz Zieliński\nwychowawca klasy 2B',
      dateSent: daysAgo(0, 7, 45),
      isRead: false,
      folder: 'inbox',
    },
    {
      id: 'mock-msg-2',
      sender: TEACHERS.dyrektor,
      subject: 'Dzień wolny od zajęć dydaktycznych',
      content:
        'Szanowni Rodzice, Drodzy Uczniowie,\n\ninformuję, że zgodnie z decyzją Dyrektora Szkoły dzień 2 maja jest dniem wolnym od zajęć dydaktyczno-wychowawczych. W tym dniu szkoła zapewnia zajęcia opiekuńcze dla chętnych uczniów.\n\nBarbara Pawłowska\nDyrektor Szkoły',
      dateSent: daysAgo(1, 14, 20),
      isRead: false,
      folder: 'inbox',
    },
    {
      id: 'mock-msg-3',
      sender: TEACHERS.biologia,
      subject: 'Konkurs biologiczny – zgłoszenia',
      content:
        'Dzień dobry,\n\nzapraszam chętnych uczniów do udziału w Olimpiadzie Biologicznej. Zgłoszenia przyjmuję do końca tygodnia osobiście lub przez dziennik.\n\nPozdrawiam\nMagdalena Kamińska',
      dateSent: daysAgo(2, 12, 5),
      isRead: true,
      folder: 'inbox',
    },
    {
      id: 'mock-msg-4',
      sender: TEACHERS.sekretariat,
      subject: 'Wycieczka do Centrum Nauki Kopernik – zgoda rodziców',
      content:
        'W załączeniu przesyłamy formularz zgody na udział w wycieczce do Centrum Nauki Kopernik. Prosimy o podpisanie i zwrot wychowawcy do piątku.\n\nKoszt wycieczki: 85 zł (bilet + przejazd).\n\nSekretariat XIV LO',
      dateSent: daysAgo(3, 9, 30),
      isRead: true,
      folder: 'inbox',
      attachments: [
        { name: 'zgoda_wycieczka_CNK.pdf', url: 'https://example.invalid/zgoda_wycieczka_CNK.pdf', size: 184_320 },
      ],
    },
    {
      id: 'mock-msg-5',
      sender: TEACHERS.matematyka,
      subject: 'Poprawa sprawdzianu z funkcji kwadratowej',
      content:
        'Uczniowie, którzy chcą poprawić sprawdzian z funkcji kwadratowej, mogą to zrobić w czwartek na 8. lekcji w sali 24. Proszę przynieść kalkulator i tablice maturalne.\n\nT. Zieliński',
      dateSent: daysAgo(5, 16, 10),
      isRead: true,
      folder: 'inbox',
    },
    {
      id: 'mock-msg-6',
      sender: TEACHERS.pedagog,
      subject: 'Warsztaty „Bezpieczny Internet”',
      content:
        'Szanowni Państwo,\n\nw przyszłym tygodniu w ramach godzin wychowawczych odbędą się warsztaty profilaktyczne „Bezpieczny Internet” prowadzone przez specjalistów z Fundacji Dajemy Dzieciom Siłę.\n\nJoanna Grabowska\npedagog szkolny',
      dateSent: daysAgo(8, 11, 0),
      isRead: true,
      folder: 'inbox',
    },
    {
      id: 'mock-msg-7',
      sender: TEACHERS.informatyka,
      subject: 'Projekt – termin oddania',
      content:
        'Przypominam, że termin oddania projektu strony WWW mija w najbliższy piątek. Pliki proszę przesłać jako archiwum ZIP przez dziennik.\n\nPaweł Mazur',
      dateSent: daysAgo(12, 13, 40),
      isRead: true,
      folder: 'inbox',
    },
    {
      id: 'mock-msg-s1',
      sender: TEACHERS.wychowawca,
      subject: 'Usprawiedliwienie nieobecności 12.11',
      content:
        'Dzień dobry,\n\nproszę o usprawiedliwienie nieobecności syna Jana w dniu 12 listopada z powodu wizyty lekarskiej.\n\nZ poważaniem\nMaria Kowalska',
      dateSent: daysAgo(4, 19, 15),
      isRead: true,
      folder: 'sent',
    },
    {
      id: 'mock-msg-s2',
      sender: TEACHERS.informatyka,
      subject: 'Re: Projekt – termin oddania',
      content: 'Dzień dobry,\n\nprzesyłam projekt w załączniku.\n\nJan Kowalski, 2B',
      dateSent: daysAgo(10, 20, 30),
      isRead: true,
      folder: 'sent',
      attachments: [{ name: 'projekt_www_kowalski.zip', url: 'https://example.invalid/projekt.zip', size: 1_048_576 }],
    },
  ];
}

/** Templates for simulated incoming messages. */
const INCOMING_TEMPLATES: ReadonlyArray<{ sender: string; subject: string; content: string }> = [
  {
    sender: TEACHERS.matematyka,
    subject: 'Kartkówka z ciągów geometrycznych',
    content: 'Informuję, że na najbliższej lekcji matematyki odbędzie się kartkówka z ciągów geometrycznych (3 ostatnie tematy).\n\nT. Zieliński',
  },
  {
    sender: TEACHERS.polski,
    subject: 'Lektura na przyszły tydzień',
    content: 'Proszę o przeczytanie „Wesela” S. Wyspiańskiego do przyszłego poniedziałku. Będziemy omawiać akt I.\n\nA. Wiśniewska',
  },
  {
    sender: TEACHERS.wf,
    subject: 'Zawody międzyszkolne w siatkówce',
    content: 'Zapraszam chętnych na treningi przed zawodami międzyszkolnymi – wtorki i czwartki po 8. lekcji.\n\nK. Krawczyk',
  },
  {
    sender: TEACHERS.dyrektor,
    subject: 'Zmiana planu lekcji od poniedziałku',
    content: 'Od najbliższego poniedziałku obowiązuje zaktualizowany plan lekcji. Prosimy o zapoznanie się ze zmianami w dzienniku.\n\nDyrekcja',
  },
  {
    sender: TEACHERS.chemia,
    subject: 'Materiały do powtórki przed sprawdzianem',
    content: 'W załączniku przesyłam zestaw zadań powtórzeniowych z reakcji redoks. Sprawdzian za tydzień.\n\nR. Dąbrowski',
  },
];

// ───────────────────────────── Provider ─────────────────────────────

/**
 * Demo data provider with realistic Polish school data.
 * State lives in memory (the offline DB is the source of truth for the UI).
 */
export class MockVulcanProvider implements IVulcanDataProvider {
  readonly mode = 'mock' as const;

  private messages: Message[] = buildMessages();
  private grades: Grade[] = buildGrades();
  private readonly lessons: Lesson[] = buildTimetable();
  private readonly exams: Exam[] = buildExams();
  private incomingCounter = 0;

  async fetchMessages(folder?: MessageFolder): Promise<Message[]> {
    await latency();
    const list = folder ? this.messages.filter((m) => m.folder === folder) : this.messages;
    return list.map((m) => ({ ...m })).sort((a, b) => b.dateSent.localeCompare(a.dateSent));
  }

  async fetchMessageContent(id: string): Promise<string> {
    await latency();
    const msg = this.messages.find((m) => m.id === id);
    if (!msg) throw new Error(`Wiadomość ${id} nie istnieje`);
    return msg.content;
  }

  async markMessageAsRead(id: string): Promise<void> {
    await sleep(100);
    const msg = this.messages.find((m) => m.id === id);
    if (msg) msg.isRead = true;
  }

  async fetchGrades(): Promise<Grade[]> {
    await latency();
    return this.grades.map((g) => ({ ...g }));
  }

  async fetchTimetable(_weekDate?: Date): Promise<Lesson[]> {
    await latency();
    return this.lessons.map((l) => ({ ...l, changeInfo: l.changeInfo ? { ...l.changeInfo } : undefined }));
  }

  async fetchExams(_weekDate?: Date): Promise<Exam[]> {
    await latency();
    return this.exams.map((e) => ({ ...e })).sort((a, b) => a.date.localeCompare(b.date));
  }

  async fetchDutyStatus(_weekDate?: Date): Promise<DutyInfo> {
    await sleep(150);
    return {
      isOnDutyThisWeek: true,
      details: 'Masz dyżur klasowy w tym tygodniu (Poniedziałek – Piątek)',
    };
  }

  async verifySession(): Promise<SessionInfo> {
    await sleep(150);
    return { userName: MOCK_STUDENT.userName, schoolName: MOCK_STUDENT.schoolName };
  }

  // ─────────────── Demo helpers (Mock only) ───────────────

  /**
   * Generates a new unread inbox message from a teacher.
   * The next `fetchMessages()` call will include it, so the sync service
   * detects it as new and fires a notification.
   */
  simulateIncomingMessage(): Message {
    const tpl = pick(INCOMING_TEMPLATES);
    this.incomingCounter += 1;
    const msg: Message = {
      id: `mock-msg-new-${Date.now()}-${this.incomingCounter}`,
      sender: tpl.sender,
      subject: tpl.subject,
      content: tpl.content,
      dateSent: new Date().toISOString(),
      isRead: false,
      folder: 'inbox',
    };
    this.messages.unshift(msg);
    return { ...msg };
  }

  /** Generates a new random grade (to test grade notifications). */
  simulateIncomingGrade(): Grade {
    const subjKey = pick(Object.keys(SUBJECTS).filter((k) => k !== 'gw'));
    const subj = SUBJECTS[subjKey];
    const grade: Grade = {
      id: `mock-grade-new-${Date.now()}`,
      subject: subj.name,
      value: pick(['2', '3', '3+', '4', '4-', '4+', '5', '5-', '6']),
      weight: pick([1, 2, 3]),
      category: pick(['Kartkówka', 'Sprawdzian', 'Odpowiedź ustna', 'Praca domowa']),
      description: 'Nowa ocena (symulacja)',
      date: new Date().toISOString(),
      teacher: subj.teacher,
    };
    this.grades.push(grade);
    return { ...grade };
  }
}
