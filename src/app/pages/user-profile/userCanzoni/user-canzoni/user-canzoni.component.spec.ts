import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserCanzoniComponent } from './user-canzoni.component';

describe('UserCanzoniComponent', () => {
  let component: UserCanzoniComponent;
  let fixture: ComponentFixture<UserCanzoniComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UserCanzoniComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(UserCanzoniComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
