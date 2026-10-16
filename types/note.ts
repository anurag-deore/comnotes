export interface Note {
  id: string;
  title: string;
  content: string;
  // Bumped on every save; a save only applies if the server still has the rev it started from
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}
