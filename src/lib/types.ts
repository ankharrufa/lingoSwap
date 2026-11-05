export type Profile = {
  id: string;
  display_name: string;
  native_lang: string;
  learning_lang: string;
  email_notify?: boolean;
};

export type Pair = {
  id: string;
  user_a: string;
  user_b: string | null;
  invite_code: string;
};

export type Lesson = {
  id: string;
  pair_id: string;
  author_id: string;
  recipient_id: string;
  template: "word_set" | "phrase";
  title: string;
  prompt: string | null;
  created_at: string;
  opened_at: string | null;
  completed_at: string | null;
};

export type Item = {
  id: string;
  lesson_id: string;
  position: number;
  term: string;
  translation: string;
  note: string | null;
  audio_path: string | null;
};

export type Challenge = {
  id: string;
  pair_id: string;
  author_id: string;
  recipient_id: string;
  kind: "quiz" | "type" | "record";
  prompt: string;
  data: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
};

export type Attempt = {
  id: string;
  challenge_id: string;
  user_id: string;
  answer: Record<string, unknown>;
  score: number | null;
  audio_path: string | null;
  rating: "perfect" | "close" | "try_again" | null;
  rated_at: string | null;
  created_at: string;
};

export type Flashcard = {
  id: string;
  owner_id: string;
  item_id: string;
  box: number;
  due_at: string;
  reps: number;
  lapses: number;
  mastered_at: string | null;
  items?: Item;
};

export type RequestRow = {
  id: string;
  pair_id: string;
  from_id: string;
  text: string;
  done_at: string | null;
  created_at: string;
};
