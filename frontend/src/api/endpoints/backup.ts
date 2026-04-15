/**
 * Backup API Endpoints - Database Export/Import
 */

import apiClient from "../client";

export interface BackupCollectionInfo {
	name: string;
	documentCount: number;
	sizeBytes: number;
}

export interface BackupInfo {
	collections: BackupCollectionInfo[];
	totalDocuments: number;
	totalSizeBytes: number;
}

interface ImportResponse {
	status: string;
	collectionsRestored: number;
	totalDocuments: number;
}

function transformBackupInfo(data: Record<string, unknown>): BackupInfo {
	const rawCollections = data.collections as Record<string, unknown>[];
	return {
		collections: rawCollections.map((c) => ({
			name: c.name as string,
			documentCount: c.document_count as number,
			sizeBytes: c.size_bytes as number,
		})),
		totalDocuments: data.total_documents as number,
		totalSizeBytes: data.total_size_bytes as number,
	};
}

export interface BackupBlob {
	blob: Blob;
	filename: string;
}

export const backupApi = {
	/** Get backup info: collection names, doc counts, sizes. */
	async getBackupInfo(): Promise<BackupInfo> {
		const response =
			await apiClient.get<Record<string, unknown>>("/admin/backup/info");
		return transformBackupInfo(response.data);
	},

	/** Fetch the full database backup as a Blob + suggested filename. */
	async fetchBackupBlob(): Promise<BackupBlob> {
		const response = await apiClient.post("/admin/backup/export", null, {
			responseType: "blob",
		});

		const contentDisposition = response.headers["content-disposition"] as
			| string
			| undefined;
		let filename = "backup.json";
		if (contentDisposition) {
			const match = contentDisposition.match(/filename="?([^"]+)"?/);
			if (match?.[1]) {
				filename = match[1];
			}
		}

		const blob = new Blob([response.data as BlobPart], {
			type: "application/json",
		});
		return { blob, filename };
	},

	/** Browser fallback — fetch + trigger an anchor download. */
	async exportBackup(): Promise<void> {
		const { blob, filename } = await this.fetchBackupBlob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	},

	/** Import a backup JSON file (destructive — replaces existing data). */
	async importBackup(file: File): Promise<ImportResponse> {
		const formData = new FormData();
		formData.append("file", file);

		const response = await apiClient.post<Record<string, unknown>>(
			"/admin/backup/import",
			formData,
			{
				headers: { "Content-Type": "multipart/form-data" },
				timeout: 120_000, // 2 min for large imports
			},
		);

		const d = response.data;
		return {
			status: d.status as string,
			collectionsRestored: d.collections_restored as number,
			totalDocuments: d.total_documents as number,
		};
	},
};

export default backupApi;
