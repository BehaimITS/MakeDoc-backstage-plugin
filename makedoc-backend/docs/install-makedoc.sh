#!/usr/bin/env bash

set -euo pipefail


CONTEXT="${1:-$(kubectl config current-context)}"

NAMESPACE="default"

SERVICE_ACCOUNT="makedoc-controller"

OUTPUT="makedoc-controller-kubeconfig.yaml"


echo "================================="
echo "Installing MakeDoc Kubernetes RBAC"
echo "================================="
echo ""

echo "Using context:"
echo "${CONTEXT}"
echo ""


echo "Applying RBAC..."

kubectl apply -f makedoc-rbac.yaml


echo ""
echo "Creating controller token..."

TOKEN=$(kubectl create token \
  "${SERVICE_ACCOUNT}" \
  -n "${NAMESPACE}" \
  --duration=8760h)


echo "Reading cluster information..."

SERVER=$(kubectl config view \
  --raw \
  --context "${CONTEXT}" \
  -o jsonpath='{.clusters[0].cluster.server}')


CA_DATA=$(kubectl config view \
  --raw \
  --context "${CONTEXT}" \
  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')



if [ -z "${CA_DATA}" ]; then

  CA_PATH=$(kubectl config view \
    --raw \
    --context "${CONTEXT}" \
    -o jsonpath='{.clusters[0].cluster.certificate-authority}')


  if [ -z "${CA_PATH}" ]; then
    echo ""
    echo "ERROR: Could not find Kubernetes CA certificate"
    exit 1
  fi


  CA_DATA=$(cat "${CA_PATH}" | base64 -w 0)

fi


echo ""
echo "Generating kubeconfig..."


cat > "${OUTPUT}" <<EOF
apiVersion: v1
kind: Config

clusters:

- name: makedoc-cluster
  cluster:
    server: ${SERVER}
    certificate-authority-data: ${CA_DATA}


contexts:

- name: makedoc-controller
  context:
    cluster: makedoc-cluster
    user: makedoc-controller


current-context: makedoc-controller


users:

- name: makedoc-controller
  user:
    token: ${TOKEN}
EOF


chmod 600 "${OUTPUT}"


echo ""
echo "================================="
echo "MakeDoc installation complete"
echo "================================="
echo ""

echo "Generated kubeconfig:"
echo "${OUTPUT}"
