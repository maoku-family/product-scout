declare module "google-trends-api" {
  type TrendsOptions = {
    keyword: string | string[];
    geo?: string;
    startTime?: Date;
    endTime?: Date;
    hl?: string;
    timezone?: number;
    category?: number;
  };

  type GoogleTrendsApi = {
    interestOverTime: (options: TrendsOptions) => Promise<string>;
    interestByRegion: (options: TrendsOptions) => Promise<string>;
    relatedQueries: (options: TrendsOptions) => Promise<string>;
    relatedTopics: (options: TrendsOptions) => Promise<string>;
    dailyTrends: (options: {
      geo: string;
      trendDate?: Date;
    }) => Promise<string>;
    realTimeTrends: (options: {
      geo: string;
      category?: string;
    }) => Promise<string>;
  };

  const googleTrends: GoogleTrendsApi;
  export default googleTrends;
}
