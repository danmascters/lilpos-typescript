type StationDataManagerState = {
  loading: boolean;
  error: string;
  sections: LocalDataAdminSection[];
  activeSectionId: string;
  records: LocalDataAdminRecord[];
  query: string;
  selectedRecord: LocalDataAdminRecord | null;
  health: LocalDataAdminHealth | null;
  lastRefreshedAt: string;
  actionMessage: string;
};
