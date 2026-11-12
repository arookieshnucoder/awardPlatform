package wtf.hackhub.infrastructure.storage;

import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import org.apache.tika.Tika;
import org.springframework.stereotype.Component;
import wtf.hackhub.infrastructure.config.AppProperties;

/** Checks the stored object, never the client-supplied attachment size or MIME type. */
@Component
public class NominationPdfValidator {

	private static final long MAX_PDF_BYTES = 10L * 1024 * 1024;
	private final MinioClient minio;
	private final String bucket;
	private final Tika tika = new Tika();

	public NominationPdfValidator(MinioClient minio, AppProperties properties) {
		this.minio = minio;
		var buckets = properties.minio().buckets();
		this.bucket = buckets == null ? "hackhub-project-attachments"
				: buckets.getOrDefault("project-attachments", "hackhub-project-attachments");
	}

	public void validate(String key) {
		try (var input = minio.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build())) {
			// The object response includes both metadata and bytes, avoiding a separate HEAD request.
			long size;
			try {
				size = Long.parseLong(input.headers().get("Content-Length"));
			} catch (NumberFormatException ex) {
				throw new IllegalArgumentException("Unable to verify the PDF attachment. Upload it again.");
			}
			if (size <= 0 || size > MAX_PDF_BYTES)
				throw new IllegalArgumentException("Individual attachment must be a PDF of up to 10 MB.");
			if (!"application/pdf".equalsIgnoreCase(input.headers().get("Content-Type")))
				throw new IllegalArgumentException("Individual attachment must contain a PDF document.");
			if (!"application/pdf".equals(tika.detect(input)))
				throw new IllegalArgumentException("Individual attachment must contain a PDF document.");
		} catch (IllegalArgumentException ex) {
			throw ex;
		} catch (Exception ex) {
			throw new IllegalArgumentException("Unable to verify the PDF attachment. Upload it again.");
		}
	}
}
