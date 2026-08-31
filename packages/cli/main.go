package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"
)

var (
	version = "0.1.0"
	apiURL  string
	apiKey  string
	client  = &http.Client{Timeout: 30 * time.Second}
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "quarkbox",
		Short: "QuarkBox CLI — Production Cloud Sandbox Engine for AI Agents",
		Long: `
  ╔═══════════════════════════════════════╗
  ║     ⚛️  QuarkBox CLI v` + version + `           ║
  ║                                       ║
  ║  Secure, elastic cloud sandboxes      ║
  ║  for AI agents and developers         ║
  ╚═══════════════════════════════════════╝`,
		Version: version,
	}

	// Global flags
	rootCmd.PersistentFlags().StringVar(&apiURL, "api-url", "http://localhost:3000/api", "QuarkBox API URL")
	rootCmd.PersistentFlags().StringVar(&apiKey, "api-key", "", "API key for authentication")

	// Register commands
	rootCmd.AddCommand(sandboxCmd())
	rootCmd.AddCommand(templateCmd())
	rootCmd.AddCommand(clusterCmd())
	rootCmd.AddCommand(healthCmd())

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// ── HTTP Helper ─────────────────────────────────────────────────────

func doRequest(method, path string, body interface{}, out interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, strings.TrimRight(apiURL, "/")+path, bodyReader)
	if err != nil {
		return fmt.Errorf("failed to create HTTP request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API Error %d: %s", resp.StatusCode, string(respBody))
	}

	if out != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("failed to decode response: %w", err)
		}
	}

	return nil
}

// ── Sandbox Data Structures ─────────────────────────────────────────

type Sandbox struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	Image       string `json:"image"`
	ContainerID string `json:"containerId"`
	ContainerIP string `json:"containerIp"`
	CPULimit    int    `json:"cpuLimit"`
	MemoryLimit string `json:"memoryLimit"`
	CreatedAt   string `json:"createdAt"`
}

type ExecResult struct {
	ExitCode int    `json:"exitCode"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

type ContainerStats struct {
	ContainerID string `json:"containerId"`
	CPU         struct {
		UsagePercent float64 `json:"usagePercent"`
		NumCPUs      int     `json:"numCpus"`
	} `json:"cpu"`
	Memory struct {
		UsageMb      float64 `json:"usageMb"`
		LimitMb      float64 `json:"limitMb"`
		UsagePercent float64 `json:"usagePercent"`
		Cache        float64 `json:"cache"`
	} `json:"memory"`
	Network struct {
		RxBytes int64 `json:"rxBytes"`
		TxBytes int64 `json:"txBytes"`
	} `json:"network"`
	BlockIO struct {
		WriteBytes int64 `json:"writeBytes"`
	} `json:"blockIO"`
	PIDs int `json:"pids"`
}

type Template struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Category    string `json:"category"`
	Image       string `json:"image"`
	Description string `json:"description"`
	DefaultCPU  int    `json:"defaultCpu"`
	DefaultMem  string `json:"defaultMemory"`
}

// ── Sandbox Commands ────────────────────────────────────────────────

func sandboxCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "sandbox",
		Aliases: []string{"sb", "sandboxes"},
		Short:   "Manage cloud sandboxes",
	}

	cmd.AddCommand(sandboxCreateCmd())
	cmd.AddCommand(sandboxListCmd())
	cmd.AddCommand(sandboxGetCmd())
	cmd.AddCommand(sandboxExecCmd())
	cmd.AddCommand(sandboxStatsCmd())
	cmd.AddCommand(sandboxStopCmd())
	cmd.AddCommand(sandboxDeleteCmd())

	return cmd
}

func sandboxCreateCmd() *cobra.Command {
	var image string
	var cpu int
	var memory string

	cmd := &cobra.Command{
		Use:   "create [name]",
		Short: "Create and provision a new isolated sandbox",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name := args[0]
			payload := map[string]interface{}{
				"name":        name,
				"image":       image,
				"cpuLimit":    cpu,
				"memoryLimit": memory,
			}

			var sb Sandbox
			if err := doRequest("POST", "/sandboxes", payload, &sb); err != nil {
				return err
			}

			fmt.Println("✅ Sandbox created successfully!")
			fmt.Printf("   ID:        %s\n", sb.ID)
			fmt.Printf("   Name:      %s\n", sb.Name)
			fmt.Printf("   Status:    %s\n", sb.Status)
			fmt.Printf("   Image:     %s\n", sb.Image)
			fmt.Printf("   Container: %s\n", sb.ContainerID)
			return nil
		},
	}

	cmd.Flags().StringVarP(&image, "image", "i", "ubuntu:22.04", "Container image")
	cmd.Flags().IntVarP(&cpu, "cpu", "c", 2, "CPU cores")
	cmd.Flags().StringVarP(&memory, "memory", "m", "512m", "Memory limit")
	return cmd
}

func sandboxListCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "list",
		Aliases: []string{"ls"},
		Short:   "List all active sandboxes",
		RunE: func(cmd *cobra.Command, args []string) error {
			var sandboxes []Sandbox
			if err := doRequest("GET", "/sandboxes", nil, &sandboxes); err != nil {
				return err
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
			fmt.Fprintln(w, "ID\tNAME\tSTATUS\tIMAGE\tCONTAINER ID\tCPU\tRAM")
			fmt.Fprintln(w, "--\t----\t------\t-----\t------------\t---\t---")

			if len(sandboxes) == 0 {
				fmt.Fprintln(w, "(no active sandboxes found)")
			} else {
				for _, sb := range sandboxes {
					cid := sb.ContainerID
					if len(cid) > 12 {
						cid = cid[:12]
					}
					fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%d\t%s\n",
						sb.ID, sb.Name, sb.Status, sb.Image, cid, sb.CPULimit, sb.MemoryLimit)
				}
			}
			w.Flush()
			return nil
		},
	}
}

func sandboxGetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "get [id]",
		Short: "Get details for a specific sandbox",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var sb Sandbox
			if err := doRequest("GET", "/sandboxes/"+args[0], nil, &sb); err != nil {
				return err
			}

			fmt.Printf("Sandbox Details for %s:\n", sb.ID)
			fmt.Printf("  Name:        %s\n", sb.Name)
			fmt.Printf("  Status:      %s\n", sb.Status)
			fmt.Printf("  Image:       %s\n", sb.Image)
			fmt.Printf("  Container:   %s\n", sb.ContainerID)
			fmt.Printf("  IP:          %s\n", sb.ContainerIP)
			fmt.Printf("  Resources:   %d CPU / %s RAM\n", sb.CPULimit, sb.MemoryLimit)
			return nil
		},
	}
}

func sandboxExecCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "exec [id] -- [command...]",
		Short: "Execute a command inside a running sandbox",
		Args:  cobra.MinimumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			sandboxID := args[0]
			commandStr := strings.Join(args[1:], " ")

			payload := map[string]string{
				"command": commandStr,
			}

			var res ExecResult
			if err := doRequest("POST", "/sandboxes/"+sandboxID+"/exec", payload, &res); err != nil {
				return err
			}

			if res.Stdout != "" {
				fmt.Print(res.Stdout)
			}
			if res.Stderr != "" {
				fmt.Fprint(os.Stderr, res.Stderr)
			}

			if res.ExitCode != 0 {
				os.Exit(res.ExitCode)
			}
			return nil
		},
	}
}

func sandboxStatsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "stats [id]",
		Short: "Get deep cgroup resource usage metrics for a sandbox",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var stats ContainerStats
			if err := doRequest("GET", "/sandboxes/"+args[0]+"/stats", nil, &stats); err != nil {
				return err
			}

			fmt.Printf("📊 Deep Metrics for Sandbox %s:\n", args[0])
			fmt.Printf("   CPU Usage:      %.2f%% (%d cores)\n", stats.CPU.UsagePercent, stats.CPU.NumCPUs)
			fmt.Printf("   Memory Usage:   %.2f MB / %.0f MB (%.2f%%)\n", stats.Memory.UsageMb, stats.Memory.LimitMb, stats.Memory.UsagePercent)
			fmt.Printf("   Page Cache:     %.0f KB\n", stats.Memory.Cache)
			fmt.Printf("   Network RX/TX:  %.1f KB / %.1f KB\n", float64(stats.Network.RxBytes)/1024, float64(stats.Network.TxBytes)/1024)
			fmt.Printf("   Block Disk I/O: %.2f MB\n", float64(stats.BlockIO.WriteBytes)/(1024*1024))
			fmt.Printf("   Active PIDs:    %d\n", stats.PIDs)
			return nil
		},
	}
}

func sandboxStopCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "stop [id]",
		Short: "Stop a running sandbox",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var sb Sandbox
			if err := doRequest("POST", "/sandboxes/"+args[0]+"/stop", nil, &sb); err != nil {
				return err
			}
			fmt.Printf("✅ Sandbox %s stopped (status: %s)\n", args[0], sb.Status)
			return nil
		},
	}
}

func sandboxDeleteCmd() *cobra.Command {
	return &cobra.Command{
		Use:     "delete [id]",
		Aliases: []string{"rm"},
		Short:   "Permanently delete a sandbox",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := doRequest("DELETE", "/sandboxes/"+args[0], nil, nil); err != nil {
				return err
			}
			fmt.Printf("✅ Sandbox %s deleted\n", args[0])
			return nil
		},
	}
}

// ── Template / Marketplace Commands ─────────────────────────────────

func templateCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "template",
		Aliases: []string{"tpl", "marketplace"},
		Short:   "Browse and launch Golden Marketplace Templates",
	}

	cmd.AddCommand(templateListCmd())
	cmd.AddCommand(templateLaunchCmd())
	return cmd
}

func templateListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List all Golden Marketplace Templates",
		RunE: func(cmd *cobra.Command, args []string) error {
			var templates []Template
			if err := doRequest("GET", "/templates", nil, &templates); err != nil {
				return err
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
			fmt.Fprintln(w, "SLUG\tNAME\tCATEGORY\tIMAGE\tRESOURCES")
			fmt.Fprintln(w, "----\t----\t--------\t-----\t---------")
			for _, t := range templates {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%d vCPU / %s\n",
					t.Slug, t.Name, t.Category, t.Image, t.DefaultCPU, t.DefaultMem)
			}
			w.Flush()
			return nil
		},
	}
}

func templateLaunchCmd() *cobra.Command {
	var name string

	cmd := &cobra.Command{
		Use:   "launch [slug]",
		Short: "1-Click Launch a Golden Marketplace Template into a sandbox",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			slug := args[0]
			if name == "" {
				name = fmt.Sprintf("box-%s-%d", slug, time.Now().Unix()%10000)
			}

			payload := map[string]interface{}{
				"name": name,
			}

			var res struct {
				Sandbox  Sandbox  `json:"sandbox"`
				Template Template `json:"template"`
			}
			if err := doRequest("POST", "/templates/"+slug+"/launch", payload, &res); err != nil {
				return err
			}

			fmt.Printf("🚀 Launched Golden Template '%s' successfully!\n", res.Template.Name)
			fmt.Printf("   Sandbox ID: %s\n", res.Sandbox.ID)
			fmt.Printf("   Name:       %s\n", res.Sandbox.Name)
			fmt.Printf("   Status:     %s\n", res.Sandbox.Status)
			fmt.Printf("   Image:      %s\n", res.Sandbox.Image)
			return nil
		},
	}

	cmd.Flags().StringVarP(&name, "name", "n", "", "Custom name for launched sandbox")
	return cmd
}

// ── Health Command ──────────────────────────────────────────────────

func healthCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "health",
		Short: "Check QuarkBox API health and connectivity",
		RunE: func(cmd *cobra.Command, args []string) error {
			var health struct {
				Status    string  `json:"status"`
				Service   string  `json:"service"`
				Version   string  `json:"version"`
				UptimeSec float64 `json:"uptime"`
			}
			if err := doRequest("GET", "/health", nil, &health); err != nil {
				return err
			}

			fmt.Printf("✅ QuarkBox API is Healthy!\n")
			fmt.Printf("   Status:  %s\n", health.Status)
			fmt.Printf("   Service: %s (v%s)\n", health.Service, health.Version)
			fmt.Printf("   Uptime:  %.1fs\n", health.UptimeSec)
			return nil
		},
	}
}

// ── Cluster Data Structures & Commands ───────────────────────────────

type Cluster struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	NetworkName string   `json:"networkName"`
	Status      string   `json:"status"`
	SandboxIDs  []string `json:"sandboxIds"`
	CreatedAt   string   `json:"createdAt"`
}

func clusterCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "cluster",
		Short: "Manage multi-sandbox cluster topologies and network meshes",
	}

	cmd.AddCommand(clusterListCmd())
	cmd.AddCommand(clusterGetCmd())
	cmd.AddCommand(clusterDeleteCmd())
	return cmd
}

func clusterListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List all multi-sandbox clusters",
		RunE: func(cmd *cobra.Command, args []string) error {
			var clusters []Cluster
			if err := doRequest("GET", "/clusters", nil, &clusters); err != nil {
				return err
			}

			if len(clusters) == 0 {
				fmt.Println("No active clusters found.")
				return nil
			}

			w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
			fmt.Fprintln(w, "ID\tNAME\tSTATUS\tNETWORK\tNODES")
			fmt.Fprintln(w, "--\t----\t------\t-------\t-----")
			for _, c := range clusters {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%d\n",
					c.ID, c.Name, c.Status, c.NetworkName, len(c.SandboxIDs))
			}
			w.Flush()
			return nil
		},
	}
}

func clusterGetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "get [id]",
		Short: "Get details and node statuses for a cluster",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var res struct {
				Cluster   Cluster   `json:"cluster"`
				Sandboxes []Sandbox `json:"sandboxes"`
			}
			if err := doRequest("GET", "/clusters/"+args[0], nil, &res); err != nil {
				return err
			}

			fmt.Printf("🌐 Cluster Details: %s (%s)\n", res.Cluster.Name, res.Cluster.ID)
			fmt.Printf("   Status:     %s\n", res.Cluster.Status)
			fmt.Printf("   Network:    %s (Isolated SDN Mesh)\n", res.Cluster.NetworkName)
			fmt.Printf("   Node Count: %d\n\n", len(res.Sandboxes))

			if len(res.Sandboxes) > 0 {
				w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
				fmt.Fprintln(w, "NODE ID\tNAME\tSTATUS\tIMAGE\tCONTAINER IP")
				fmt.Fprintln(w, "-------\t----\t------\t-----\t------------")
				for _, sb := range res.Sandboxes {
					fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
						sb.ID[:8], sb.Name, sb.Status, sb.Image, sb.ContainerIP)
				}
				w.Flush()
			}
			return nil
		},
	}
}

func clusterDeleteCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "delete [id]",
		Short: "Tear down a cluster, all its member sandboxes, and its network mesh",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := doRequest("DELETE", "/clusters/"+args[0], nil, nil); err != nil {
				return err
			}
			fmt.Printf("💥 Cluster %s and its network mesh destroyed.\n", args[0])
			return nil
		},
	}
}
