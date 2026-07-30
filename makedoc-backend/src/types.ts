export type JobStatus =
  | 'STARTED'
  | 'CLONING_REPOSITORY'
  | 'MAKEDOC_RUNNING'
  | 'COMMITTING_DOCUMENTATION'
  | 'COMPLETED'
  | 'FAILED';


export interface RunJobRequest {

  repoUrl: string;

  accessToken: string;

  inputDir: string;

  outputDir: string;

  workspace?: string;

  profile?: string;

  filter?: string;


  selections?: {

    bw5?: Record<string, boolean>;

    bw6?: Record<string, boolean>;

    ems?: Record<string, boolean>;

  };

}


export interface JobStatusResponse {

  status: JobStatus;

  podName?: string;

}