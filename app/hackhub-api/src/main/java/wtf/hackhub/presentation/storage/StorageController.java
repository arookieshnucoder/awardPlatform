package wtf.hackhub.presentation.storage;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import wtf.hackhub.application.storage.StoragePort;
import wtf.hackhub.application.storage.UploadFileUseCase;
import wtf.hackhub.infrastructure.config.AppProperties;
import wtf.hackhub.infrastructure.security.StorageSecurityService;

import java.util.Map;
import java.util.Set;

@Tag(name = "Storage", description = "File upload and download via MinIO")
@RestController
@RequestMapping("/api/v1/storage")
public class StorageController {

	private static final Set<String> VALID_BUCKETS = Set.of("hackhub-avatars", "hackhub-team-files",
			"hackhub-hackathon-assets", "hackhub-project-attachments", "hackhub-team-avatars");

	private final UploadFileUseCase uploadFileUseCase;
	private final StoragePort storagePort;
	private final AppProperties properties;
	private final StorageSecurityService security;

	public StorageController(UploadFileUseCase uploadFileUseCase, StoragePort storagePort, AppProperties properties,
			StorageSecurityService security) {
		this.uploadFileUseCase = uploadFileUseCase;
		this.storagePort = storagePort;
		this.properties = properties;
		this.security = security;
	}

	@Operation(summary = "Upload a file to a storage bucket")
	@ApiResponses({@ApiResponse(responseCode = "200", description = "File uploaded"),
			@ApiResponse(responseCode = "400", description = "Unknown bucket or missing file"),
			@ApiResponse(responseCode = "401", description = "Not authenticated")})
	@PostMapping(value = "/upload/{bucketKey}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public UploadResponse upload(@PathVariable String bucketKey, @RequestParam("file") MultipartFile file,
			@RequestParam("prefix") String prefix, Authentication authentication) {

		security.requireAccess(logicalBucket(bucketKey), prefix, true, authentication);
		String bucket = resolveBucket(bucketKey);
		UploadFileUseCase.Result result = uploadFileUseCase.execute(file, bucket, prefix);
		return new UploadResponse(result.key(), result.url());
	}

	@Operation(summary = "Get a presigned download URL for a stored file")
	@ApiResponses({@ApiResponse(responseCode = "200", description = "URL generated"),
			@ApiResponse(responseCode = "400", description = "Unknown bucket"),
			@ApiResponse(responseCode = "401", description = "Not authenticated")})
	@GetMapping("/url/{bucketKey}")
	public Map<String, String> presignedUrl(@PathVariable String bucketKey, @RequestParam String key,
			@RequestParam(defaultValue = "3600") int expirySeconds, Authentication authentication) {
		security.requireAccess(logicalBucket(bucketKey), key, false, authentication);
		String bucket = resolveBucket(bucketKey);
		String url = storagePort.presignedDownloadUrl(bucket, key, expirySeconds);
		return Map.of("url", url);
	}

	private String logicalBucket(String bucketKey) {
		// Both aliases and configured physical bucket names share the same policy.
		for (String name : VALID_BUCKETS) {
			String alias = name.substring("hackhub-".length());
			String configured = properties.minio().buckets() == null
					? name
					: properties.minio().buckets().getOrDefault(alias, name);
			if (bucketKey.equals(alias) || bucketKey.equals(name) || bucketKey.equals(configured))
				return alias;
		}
		throw new InvalidBucketException(bucketKey);
	}

	private String resolveBucket(String bucketKey) {
		String alias = logicalBucket(bucketKey);
		Map<String, String> configured = properties.minio().buckets();
		return configured == null ? "hackhub-" + alias : configured.getOrDefault(alias, "hackhub-" + alias);
	}

	public record UploadResponse(String key, String url) {
	}

	public static class InvalidBucketException extends RuntimeException {
		public InvalidBucketException(String bucket) {
			super("Unknown storage bucket: " + bucket);
		}
	}
}
