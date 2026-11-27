package wtf.hackhub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;

import java.time.Clock;

@SpringBootApplication
@ConfigurationPropertiesScan
public class HackHubApplication {

	@Bean
	Clock applicationClock() {
		return Clock.systemUTC();
	}

	public static void main(String[] args) {
		SpringApplication.run(HackHubApplication.class, args);
	}
}
