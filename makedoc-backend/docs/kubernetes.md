# MakeDoc Kubernetes Installation

Check the current context:

```bash
kubectl config current-context
```

---

## Install

### 1. Create RBAC resources

```bash
kubectl apply -f makedoc-rbac.yaml
```

This creates:

* `makedoc-controller` ServiceAccount (used by Backstage)
* `makedoc-runner` ServiceAccount (used by MakeDoc Jobs)
* Required Roles and RoleBindings

---

### 2. Generate kubeconfig

Run:

```bash
chmod +x install-makedoc.sh

./install-makedoc.sh
```

This creates:

```text
makedoc-controller-kubeconfig.yaml
```

This kubeconfig is used by the MakeDoc plugin to access Kubernetes.

---

### 3. Configure Backstage

Set the environment variable:

```bash
export MAKEDOC_KUBECONFIG=/path/to/makedoc-controller-kubeconfig.yaml
```

To make it persistent:

```bash
echo 'export MAKEDOC_KUBECONFIG=/path/to/makedoc-controller-kubeconfig.yaml' >> ~/.bashrc
```

Reload:

```bash
source ~/.bashrc
```

---

## Cleanup

Remove MakeDoc Kubernetes resources:

```bash
kubectl delete -f makedoc-rbac.yaml
```

Remove generated kubeconfig:

```bash
rm makedoc-controller-kubeconfig.yaml
```

