package wtf.hackhub.infrastructure.storage;

import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import io.minio.StatObjectArgs;
import okhttp3.Headers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import wtf.hackhub.infrastructure.config.AppProperties;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NominationPdfValidatorTest {

	@Mock MinioClient minio;
	NominationPdfValidator validator;
	static final String KEY = "nominations/campaign/owner/evidence.pdf";

	@BeforeEach
	void setup() {
		var properties = new AppProperties(null, null, new AppProperties.Minio("http://localhost", "", "",
				Map.of("project-attachments", "configured-attachments")));
		validator = new NominationPdfValidator(minio, properties);
	}

	void storedContent(long size, String type, InputStream bytes) throws Exception {
		var headers = new Headers.Builder().add("Content-Length", Long.toString(size)).add("Content-Type", type).build();
		when(minio.getObject(any(GetObjectArgs.class))).thenReturn(new GetObjectResponse(headers,
				"configured-attachments", "", KEY, bytes));
	}

	InputStream contents(String contents) {
		return new ByteArrayInputStream(contents.getBytes(StandardCharsets.UTF_8));
	}

	@Test
	void accepts_pdf_at_ten_mib_limit_using_configured_bucket_and_actual_bytes() throws Exception {
		storedContent(10L * 1024 * 1024, "application/pdf", contents("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"));
		assertThatCode(() -> validator.validate(KEY)).doesNotThrowAnyException();
		var request = org.mockito.ArgumentCaptor.forClass(GetObjectArgs.class);
		verify(minio).getObject(request.capture());
		verify(minio, never()).statObject(any(StatObjectArgs.class));
		assertThat(request.getValue().bucket()).isEqualTo("configured-attachments");
		assertThat(request.getValue().object()).isEqualTo(KEY);
	}

	@Test
	void rejects_actual_size_over_ten_mib_before_reading_content() throws Exception {
		var stream = mock(InputStream.class);
		storedContent(10L * 1024 * 1024 + 1, "application/pdf", stream);
		assertThatThrownBy(() -> validator.validate(KEY)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("10 MB");
		verify(stream).close();
		verifyNoMoreInteractions(stream);
	}

	@Test
	void rejects_empty_object() throws Exception {
		storedContent(0, "application/pdf", contents(""));
		assertThatThrownBy(() -> validator.validate(KEY)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("10 MB");
	}

	@Test
	void pdf_extension_and_stored_mime_do_not_hide_non_pdf_bytes() throws Exception {
		storedContent(100, "application/pdf", contents("<html><body>Not a PDF</body></html>"));
		assertThatThrownBy(() -> validator.validate(KEY)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("contain a PDF");
	}

	@Test
	void rejects_non_pdf_object_metadata() throws Exception {
		storedContent(100, "application/zip", contents(""));
		assertThatThrownBy(() -> validator.validate(KEY)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("contain a PDF");
	}

	@Test
	void missing_object_cannot_be_submitted_and_storage_errors_do_not_leak() throws Exception {
		when(minio.getObject(any(GetObjectArgs.class))).thenThrow(new java.io.IOException("internal storage details"));
		assertThatThrownBy(() -> validator.validate(KEY)).isInstanceOf(IllegalArgumentException.class)
				.hasMessageContaining("Upload it again").hasMessageNotContaining("internal storage details");
	}
}
