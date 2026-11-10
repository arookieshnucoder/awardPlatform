package wtf.hackhub.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "voting_participants")
public class VotingParticipant {

	@Id
	@Column(name = "personnel_number")
	private String personnelNumber;

	@Column(name = "organizational_unit", nullable = false)
	private String organizationalUnit;

	@Column(name = "display_name", nullable = false)
	private String displayName;

	@Column(name = "normalized_name", nullable = false)
	private String normalizedName;

	protected VotingParticipant() {
	}

	public VotingParticipant(String personnelNumber, String organizationalUnit, String displayName,
			String normalizedName) {
		this.personnelNumber = personnelNumber;
		this.organizationalUnit = organizationalUnit;
		this.displayName = displayName;
		this.normalizedName = normalizedName;
	}

	public String getPersonnelNumber() {
		return personnelNumber;
	}

	public String getOrganizationalUnit() {
		return organizationalUnit;
	}

	public String getDisplayName() {
		return displayName;
	}

	public String getNormalizedName() {
		return normalizedName;
	}
}
