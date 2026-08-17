// defines the shared types used by the MakeDoc backend
// JobStatus represents the possible states of a MakeDoc execution
// RunJobRequest defines the data accepted when creating a new MakeDoc job
// JobStatusResponse contains the current job state and the Kubernetes pod name when available

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

// contains the current status of a MakeDoc job and its pod when available
export interface JobStatusResponse {

  status: JobStatus;

  podName?: string;

}