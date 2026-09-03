import * as k8s from '@kubernetes/client-node';

// creates the Kubernetes Job used to clone the repository, run MakeDoc and push the generated documentation
export const getJobTemplate = (
  jobName: string,
  namespace: string,
  repoUrl: string,
  inputDir: string,
  outputDir: string,
  secretName: string,
  workspace?: string,
  makedocEnv: k8s.V1EnvVar[] = [],
): k8s.V1Job => {

  const workspaceEnv: k8s.V1EnvVar[] = [];

  const workspaceVolumeMounts: k8s.V1VolumeMount[] = [];

  const repositoryName =
    repoUrl
      .split('/')
      .pop()
      ?.replace(/\.git$/, '') || 'makedoc';

  if (workspace) {

    workspaceEnv.push({
      name: 'workspace',
      value: `/home/makedoc/server/scripts/srv/${workspace}`,
    });

    workspaceVolumeMounts.push({
      name: 'shared-workspace',
      mountPath: `/home/makedoc/server/scripts/srv/${workspace}`,
      subPath: `workspace-mount/${workspace}`,
    });

  }

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',

    metadata: {
      name: jobName,
      namespace,
      labels: {
        'makedoc-pipeline-id': jobName,
        app: 'makedoc',
      },
    },

    spec: {
      ttlSecondsAfterFinished: 60,
      backoffLimit: 0,

      template: {
        metadata: {
          labels: {
            'job-name': jobName,
            app: 'makedoc',
          },
        },

        spec: {
          restartPolicy: 'Never',

          serviceAccountName: 'makedoc-runner',

          volumes: [
            {
              name: 'shared-workspace',
              emptyDir: {},
            },
          ],

          initContainers: [
            {
              name: 'step1-git-clone',

              image: 'alpine/git:latest',

              env: [
                {
                  name: 'GIT_TOKEN',
                  valueFrom: {
                    secretKeyRef: {
                      name: secretName,
                      key: 'GIT_TOKEN',
                    },
                  },
                },
                {
                  name: 'REPO_URL',
                  value: repoUrl,
                },
                {
                  name: 'INPUT_DIR',
                  value: inputDir,
                },
              ],

              command: ['/bin/sh', '-c'],

              args: [
                `
                set -e

                echo "Cloning repository"

                git clone "https://oauth2:\${GIT_TOKEN}@\${REPO_URL}" /workspace

                mkdir -p /workspace/projects-mount
                mkdir -p /workspace/storage-mount

                if [ -d "/workspace/\${INPUT_DIR}" ]; then
                  cp -r "/workspace/\${INPUT_DIR}/." /workspace/projects-mount/ 2>/dev/null || true
                fi

                ${
                  workspace
                    ? `
                if [ -d "/workspace/\${WORKSPACE}" ]; then
                  mkdir -p "/workspace/workspace-mount/\${WORKSPACE}"
                  cp -r "/workspace/\${WORKSPACE}/." "/workspace/workspace-mount/\${WORKSPACE}/" 2>/dev/null || true
                fi
                `
                    : ''
                }

                chmod -R 777 /workspace

                unset GIT_TOKEN

                echo "Repository cloned successfully."
                `,
              ],

              volumeMounts: [
                {
                  name: 'shared-workspace',
                  mountPath: '/workspace',
                },
              ],
            },
          ],

          containers: [
            {
              name: 'step2-makedoc-engine',

              image: 'behaimits/makedoc:latest',

              imagePullPolicy: 'Always',

              env: [
                ...makedocEnv,
                ...workspaceEnv,
              ],

              volumeMounts: [
                {
                  name: 'shared-workspace',
                  mountPath: '/home/makedoc/projects',
                  subPath: 'projects-mount',
                },
                {
                  name: 'shared-workspace',
                  mountPath: '/home/makedoc/server/storage/default',
                  subPath: 'storage-mount',
                },
                ...workspaceVolumeMounts,
              ],
            },

            {
              name: 'step3-git-push-finalizer',

              image: 'bitnami/kubectl@sha256:95de17e6eb92da83a58c90a9df0c4cede634f898d2e6b92ea04f4a6ee6ace08d',

              command: ['/bin/sh', '-c'],

              env: [
                {
                  name: 'OUTPUT_DIR',
                  value: outputDir,
                },
                {
                  name: 'JOB_NAME',
                  value: jobName,
                },
              ],

              args: [
                `
                set -e

                sleep 5

                until [ "$(kubectl get pod \\
                -l job-name=\${JOB_NAME} \\
                -o jsonpath='{.items[0].status.containerStatuses[?(@.name=="step2-makedoc-engine")].state.terminated}')" != "" ];
                do
                  sleep 5
                done

                cd /workspace

                mkdir -p "/workspace/\${OUTPUT_DIR}"

                if [ -d "/workspace/storage-mount" ]; then
                  cp -r /workspace/storage-mount/. "/workspace/\${OUTPUT_DIR}/" 2>/dev/null || true
                fi

                find "/workspace/\${OUTPUT_DIR}" \\
                  -maxdepth 1 \\
                  -mindepth 1 \\
                  -type d \\
                  | while read item; do

                    itemName=$(basename "$item")

                    if ! echo "$itemName" | grep -Eq '^[0-9]{13}$'; then
                      rm -rf "$item"
                    fi

                  done

                if [ ! -d "/workspace/\${OUTPUT_DIR}" ]; then
                  echo "Error: output directory does not exist."
                  exit 1
                fi

                DOCUMENTATION_IDS=""

                while IFS= read -r MD_DIR; do

                  PARENT_DIR=$(dirname "$MD_DIR")

                  DOCUMENTATION_ID=$(basename "$PARENT_DIR")

                  DOCUMENTATION_IDS="\${DOCUMENTATION_IDS}\${DOCUMENTATION_ID}
"

                done < <(
                  find "/workspace/\${OUTPUT_DIR}" \\
                    -mindepth 2 \\
                    -maxdepth 2 \\
                    -type d \\
                    -name "md" \\
                    | sort
                )

                if [ -z "\${DOCUMENTATION_IDS}" ]; then

                  echo "Error: no md directories were found."

                  exit 1

                fi

                INDEX_FILE="/workspace/index.md"

                cat > "\${INDEX_FILE}" <<'EOF'
# MakeDoc Documentation

This documentation was generated by MakeDoc.

Use the navigation menu to browse the generated documentation.
EOF

                MKDOCS_FILE="/workspace/mkdocs.yml"

                cat > "\${MKDOCS_FILE}" <<'EOF'
site_name: MakeDoc Documentation

docs_dir: storage

nav:
  - Home: index.md
EOF

                generate_nav_directory() {

                  local DIRECTORY="\$1"
                  local NAV_PREFIX="\$2"
                  local INDENT="\$3"

                  find "\${DIRECTORY}" \\
                    -mindepth 1 \\
                    -maxdepth 1 \\
                    -type f \\
                    -name "*.md" \\
                    ! -name "index.md" \\
                    | sort \\
                    | while read FILE; do

                      FILENAME=\$(basename "\$FILE")

                      TITLE="\${FILENAME%.md}"

                      RELATIVE_PATH="\${NAV_PREFIX}/\${FILENAME}"

                      echo "\${INDENT}- \${TITLE}: \${RELATIVE_PATH}" \\
                        >> "\${MKDOCS_FILE}"

                  done

                  find "\${DIRECTORY}" \\
                    -mindepth 1 \\
                    -maxdepth 1 \\
                    -type d \\
                    | sort \\
                    | while read SUBDIRECTORY; do

                      DIRECTORY_NAME=\$(basename "\${SUBDIRECTORY}")

                      echo "\${INDENT}- \${DIRECTORY_NAME}:" \\
                        >> "\${MKDOCS_FILE}"

                      generate_nav_directory \\
                        "\${SUBDIRECTORY}" \\
                        "\${NAV_PREFIX}/\${DIRECTORY_NAME}" \\
                        "  \${INDENT}"

                  done

                }

                echo "\${DOCUMENTATION_IDS}" | while read ID; do

                  if [ -z "\${ID}" ]; then
                    continue
                  fi

                  DOC_DIRECTORY="/workspace/\${OUTPUT_DIR}/\${ID}/md"

                  echo "  - \${ID}:" \\
                    >> "\${MKDOCS_FILE}"

                  generate_nav_directory \\
                    "\${DOC_DIRECTORY}" \\
                    "\${ID}/md" \\
                    "      "

                done

                cat >> "\${MKDOCS_FILE}" <<'EOF'

plugins:
  - techdocs-core
EOF

                CATALOG_FILE="/workspace/catalog-info.yaml"

                cat > "\${CATALOG_FILE}" <<EOF
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${repositoryName}
  description: MakeDoc generated documentation
  annotations:
    backstage.io/techdocs-ref: dir:.
spec:
  type: documentation
  lifecycle: production
  owner: user:default/guest
EOF

                echo " Committing documentation"

                export GIT_CONFIG_GLOBAL=/workspace/.gitconfig

                git config --global --add safe.directory /workspace

                git config --global user.email "devhub-automation@example.com"

                git config --global user.name "Developer Hub Automation"

                git add "\${OUTPUT_DIR}"

                git add "mkdocs.yml"

                git add "index.md"

                git add "catalog-info.yaml"

                if ! git diff-index --quiet HEAD --; then

                  git commit \\
                    -m "MakeDoc DeveloperHub plugin auto commit"

                  git push origin main

                  echo
                  echo "Documentation committed and pushed successfully."

                else

                  echo
                  echo "No changes to commit."

                fi
                `,
              ],

              volumeMounts: [
                {
                  name: 'shared-workspace',
                  mountPath: '/workspace',
                },
              ],
            },
          ],
        },
      },
    },
  };
};